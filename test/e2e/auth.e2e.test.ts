/**
 * Database-backed end-to-end tests for the auth flow.
 *
 * These tests only run when a non-production database is explicitly provided:
 *
 *   $env:RUN_E2E = '1'
 *   $env:TEST_DATABASE_URL = 'postgresql://...'   # a dev Neon branch, never prod
 *   npm run test:e2e
 *
 * They create and then delete their own organization + user, and refuse to run
 * when TEST_DATABASE_URL points at the same host as DATABASE_URL unless
 * E2E_ALLOW_PROD=1 is set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { type Response as SupertestResponse } from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const e2eEnabled = process.env.RUN_E2E === '1' && Boolean(testDatabaseUrl);
const describeE2E = e2eEnabled ? describe : describe.skip;

const password = 'E2ePassword123!';

const getCookie = (res: SupertestResponse, name: string): string => {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected cookie "${name}" in response`);
  }
  return cookie.split(';')[0]!;
};

const expectNoSensitiveFields = (value: Record<string, unknown>) => {
  expect(value).not.toHaveProperty('hashedPassword');
  expect(value).not.toHaveProperty('refreshToken');
  expect(value).not.toHaveProperty('verificationToken');
  expect(value).not.toHaveProperty('verificationTokenExpiry');
};

describeE2E('auth end-to-end (database)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let orgId: string | undefined;
  let userId: string | undefined;
  let email: string;
  let accessCookie: string | undefined;
  let refreshCookie: string | undefined;

  beforeAll(async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const databaseUrl = testDatabaseUrl!;

    const originalHost = originalDatabaseUrl ? new URL(originalDatabaseUrl).host : undefined;
    const testHost = new URL(databaseUrl).host;

    if (originalHost === testHost && process.env.E2E_ALLOW_PROD !== '1') {
      throw new Error(
        'Refusing to run database E2E against the same host as DATABASE_URL. ' +
          'Point TEST_DATABASE_URL at a development database/branch.'
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'test';

    const appModule = await import('../../src/app.js');
    const prismaModule = await import('../../src/db/prisma.js');

    app = appModule.createApp();
    prisma = prismaModule.default;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    email = `e2e-${suffix}@example.test`;

    const organization = await prisma.organization.create({
      data: { name: `E2E Organization ${suffix}` }
    });
    orgId = organization.id;

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        orgId: organization.id,
        email,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'User',
        status: 'active',
        twoFactorEnabled: false
      }
    });
    userId = user.id;
  });

  afterAll(async () => {
    try {
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (orgId) {
        await prisma.organization.deleteMany({ where: { id: orgId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('identifies a single organization for the email', async () => {
    const res = await request(app).post('/api/v1/auth/check-email').send({ email });

    expect(res.status).toBe(200);
    expect(res.body.singleOrganization).toBe(true);
    expect(res.body.organization).toMatchObject({ orgId, userStatus: 'active' });
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword123!', orgId });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid email or password/);
  });

  it('logs in and sets httpOnly access and refresh cookies', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password, orgId });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, orgId, status: 'active' });
    expectNoSensitiveFields(res.body.user);

    const setCookies = res.headers['set-cookie'] as unknown as string[];
    expect(setCookies.join('\n')).toMatch(/HttpOnly/i);
    expect(setCookies.some((cookie) => cookie.startsWith('accessToken='))).toBe(true);
    expect(setCookies.some((cookie) => cookie.startsWith('refreshToken='))).toBe(true);

    accessCookie = getCookie(res, 'accessToken');
    refreshCookie = getCookie(res, 'refreshToken');
  });

  it('validates the access token without leaking sensitive fields', async () => {
    const res = await request(app)
      .get('/api/v1/auth/validate-token')
      .set('Cookie', accessCookie!);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user).toMatchObject({ id: userId, email, orgId });
    expectNoSensitiveFields(res.body.user);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('hashedPassword');
    expect(serialized).not.toContain('$2b$');
    expect(serialized).not.toContain('refreshToken');
  });

  it('rotates refresh tokens and rejects reuse of the old token', async () => {
    const oldRefreshCookie = refreshCookie!;

    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', oldRefreshCookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');

    accessCookie = getCookie(res, 'accessToken');
    refreshCookie = getCookie(res, 'refreshToken');
    expect(refreshCookie).not.toBe(oldRefreshCookie);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', oldRefreshCookie);
    expect(reuse.status).toBe(403);
  });

  it('logs out, clears cookies and revokes the stored refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', accessCookie!);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Logged out/);

    const afterLogout = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', refreshCookie!);
    expect(afterLogout.status).toBe(403);

    const stored = await prisma.user.findUnique({
      where: { id: userId! },
      select: { refreshToken: true }
    });
    expect(stored?.refreshToken).toBeNull();
  });
});

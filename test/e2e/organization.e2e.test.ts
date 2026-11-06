/**
 * Database-backed end-to-end tests for the organization + RBAC module.
 *
 * These tests only run when a non-production database is explicitly provided:
 *
 *   $env:RUN_E2E = '1'
 *   $env:TEST_DATABASE_URL = 'postgresql://...'
 *   npm run test:e2e
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

describeE2E('organization end-to-end (database)', () => {
  let app: Express;
  let prisma: PrismaClient;

  let superAdminId: string | undefined;
  let superAdminCookie: string | undefined;
  let orgAdminCookie: string | undefined;

  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let orgAdminId: string;
  let otherUserId: string;

  const login = async (email: string, orgId?: string): Promise<string> => {
    const payload: { email: string; password: string; orgId?: string } = {
      email,
      password
    };
    if (orgId) {
      payload.orgId = orgId;
    }

    const res = await request(app).post('/api/v1/auth/login').send(payload);
    expect(res.status).toBe(200);
    return getCookie(res, 'accessToken');
  };

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
    const hashedPassword = await bcrypt.hash(password, 10);

    const superAdmin = await prisma.superAdmin.create({
      data: {
        email: `e2e-super-${suffix}@example.test`,
        name: 'E2E Super Admin',
        hashedPassword
      }
    });
    superAdminId = superAdmin.id;

    const orgA = await prisma.organization.create({
      data: { name: `E2E Organization A ${suffix}` }
    });
    const orgB = await prisma.organization.create({
      data: { name: `E2E Organization B ${suffix}` }
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    orgIds.push(orgA.id, orgB.id);

    const orgAdmin = await prisma.user.create({
      data: {
        orgId: orgA.id,
        email: `e2e-org-admin-${suffix}@example.test`,
        hashedPassword,
        firstName: 'Org',
        lastName: 'Admin',
        status: 'active'
      }
    });
    const otherUser = await prisma.user.create({
      data: {
        orgId: orgB.id,
        email: `e2e-other-${suffix}@example.test`,
        hashedPassword,
        firstName: 'Other',
        lastName: 'User',
        status: 'active'
      }
    });
    orgAdminId = orgAdmin.id;
    otherUserId = otherUser.id;
    userIds.push(orgAdmin.id, otherUser.id);

    superAdminCookie = await login(superAdmin.email);
    orgAdminCookie = await login(orgAdmin.email, orgA.id);
  });

  afterAll(async () => {
    try {
      await prisma.userRole.deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { role: { orgId: { in: orgIds } } }
          ]
        }
      });
      await prisma.organization_admin.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.role.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });

      if (superAdminId) {
        await prisma.superAdminAuthSession.deleteMany({ where: { superAdminId } });
        await prisma.superAdmin.deleteMany({ where: { id: superAdminId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rejects unauthenticated organization access', async () => {
    const res = await request(app).get('/api/v1/organization');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SUPERADMIN_TOKEN_MISSING');
  });

  it('lets a super-admin create and list organizations', async () => {
    const createRes = await request(app)
      .post('/api/v1/organization')
      .set('Cookie', superAdminCookie!)
      .send({ name: 'E2E Created Organization', industry: 'Software' });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      name: 'E2E Created Organization',
      industry: 'Software',
      isActive: true
    });
    expect(createRes.body).not.toHaveProperty('settings');
    orgIds.push(createRes.body.id);

    const listRes = await request(app)
      .get('/api/v1/organization')
      .query({ search: 'E2E Created', limit: '10' })
      .set('Cookie', superAdminCookie!);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(createRes.body.id);
    expect(listRes.body.pagination).toMatchObject({ page: 1, limit: 10, total: 1 });
  });

  it('updates an organization and rejects empty updates', async () => {
    const updateRes = await request(app)
      .patch(`/api/v1/organization/${orgAId}`)
      .set('Cookie', superAdminCookie!)
      .send({ industry: 'Fintech' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.industry).toBe('Fintech');

    const emptyRes = await request(app)
      .patch(`/api/v1/organization/${orgAId}`)
      .set('Cookie', superAdminCookie!)
      .send({});

    expect(emptyRes.status).toBe(400);
  });

  it('returns 404 for an unknown organization', async () => {
    const res = await request(app)
      .get('/api/v1/organization/does-not-exist')
      .set('Cookie', superAdminCookie!);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('promotes an organization admin atomically and idempotently', async () => {
    const promoteRes = await request(app)
      .post(`/api/v1/organization/${orgAId}/admins`)
      .set('Cookie', superAdminCookie!)
      .send({ userId: orgAdminId });

    expect(promoteRes.status).toBe(201);
    expect(promoteRes.body).toMatchObject({ userId: orgAdminId, orgId: orgAId });

    const repeatRes = await request(app)
      .post(`/api/v1/organization/${orgAId}/admins`)
      .set('Cookie', superAdminCookie!)
      .send({ userId: orgAdminId });

    expect(repeatRes.status).toBe(201);

    const adminRows = await prisma.organization_admin.findMany({
      where: { orgId: orgAId, adminId: orgAdminId }
    });
    expect(adminRows).toHaveLength(1);

    const role = await prisma.role.findUnique({
      where: { orgId_name: { orgId: orgAId, name: 'Org_Admin' } }
    });
    expect(role).not.toBeNull();

    const roleRows = await prisma.userRole.findMany({
      where: { userId: orgAdminId, roleId: role!.id }
    });
    expect(roleRows).toHaveLength(1);
  });

  it('lists admins without leaking credentials', async () => {
    const res = await request(app)
      .get(`/api/v1/organization/${orgAId}/admins`)
      .set('Cookie', superAdminCookie!);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ userId: orgAdminId });
    expect(res.body.data[0].roles).toContain('Org_Admin');
    expect(res.body.data[0]).not.toHaveProperty('hashedPassword');
    expect(res.body.data[0]).not.toHaveProperty('refreshToken');
  });

  it('lets an organization admin manage their own organization', async () => {
    const res = await request(app)
      .get(`/api/v1/organization/${orgAId}/admins`)
      .set('Cookie', orgAdminCookie!);

    expect(res.status).toBe(200);
  });

  it('blocks cross-tenant access for organization admins', async () => {
    const readRes = await request(app)
      .get(`/api/v1/organization/${orgBId}/admins`)
      .set('Cookie', orgAdminCookie!);

    expect(readRes.status).toBe(403);
    expect(readRes.body.code).toBe('TENANT_MISMATCH');

    const promoteRes = await request(app)
      .post(`/api/v1/organization/${orgBId}/admins`)
      .set('Cookie', orgAdminCookie!)
      .send({ userId: otherUserId });

    expect(promoteRes.status).toBe(403);
  });

  it('revokes the admin record and the role grant together', async () => {
    const res = await request(app)
      .delete(`/api/v1/organization/${orgAId}/admins/${orgAdminId}`)
      .set('Cookie', superAdminCookie!);

    expect(res.status).toBe(204);

    const adminRows = await prisma.organization_admin.findMany({
      where: { orgId: orgAId, adminId: orgAdminId }
    });
    expect(adminRows).toHaveLength(0);

    const role = await prisma.role.findUnique({
      where: { orgId_name: { orgId: orgAId, name: 'Org_Admin' } }
    });
    expect(role).not.toBeNull();

    const roleRows = await prisma.userRole.findMany({
      where: { userId: orgAdminId, roleId: role!.id }
    });
    expect(roleRows).toHaveLength(0);
  });

  it('refuses to hard-delete an organization that still has users', async () => {
    const res = await request(app)
      .delete(`/api/v1/organization/${orgAId}`)
      .set('Cookie', superAdminCookie!);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORGANIZATION_NOT_EMPTY');
  });
});

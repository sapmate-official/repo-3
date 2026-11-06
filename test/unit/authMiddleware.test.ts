import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../src/db/prisma.js', () => ({
  default: {
    user: { findUnique: vi.fn() },
    superAdmin: { findUnique: vi.fn() }
  }
}));

import prisma from '../../src/db/prisma.js';
import { authenticateAny, authenticateUser } from '../../src/middleware/auth.js';
import { env } from '../../src/config/env.js';

const userApp = express();
userApp.use(cookieParser());
userApp.get('/protected', authenticateUser, (req, res) => {
  res.status(200).json({ user: req.user });
});

const anyApp = express();
anyApp.use(cookieParser());
anyApp.get('/protected', authenticateAny, (req, res) => {
  res.status(200).json({ user: req.user, superAdmin: req.superAdmin });
});

const JWT_ISSUER = 'alkaa-backend-ts';
const JWT_AUDIENCE = 'alkaa-clients';

const signUserToken = (
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {}
): string =>
  jwt.sign(payload, env.USER_ACCESS_TOKEN_SECRET, {
    expiresIn: '15m',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ...options
  });

const signSuperAdminToken = (
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {}
): string =>
  jwt.sign(payload, env.SUPER_ADMIN_ACCESS_TOKEN_SECRET, {
    expiresIn: '15m',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ...options
  });

const activeUser = {
  id: 'user-1',
  email: 'user@example.com',
  orgId: 'org-1',
  firstName: 'Test',
  lastName: 'User',
  status: 'active',
  roles: [
    {
      role: {
        name: 'Employee',
        permissions: [{ permission: { key: 'view_self' } }]
      }
    }
  ]
};

describe('authenticateUser', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.superAdmin.findUnique).mockReset();
  });

  it('rejects requests without a token', async () => {
    const res = await request(userApp).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });

  it('rejects a token that has no type claim', async () => {
    const token = signUserToken({ id: 'user-1', email: 'user@example.com', orgId: 'org-1' });
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN_TYPE');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token carrying a non-user type claim', async () => {
    const token = signUserToken({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'super_admin'
    });
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN_TYPE');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const token = signUserToken(
      { id: 'user-1', email: 'user@example.com', orgId: 'org-1', typ: 'user' },
      { expiresIn: -120 }
    );
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign(
      { id: 'user-1', email: 'user@example.com', orgId: 'org-1', typ: 'user' },
      'x'.repeat(32),
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('authenticates an active user and resolves roles/permissions', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeUser as never);

    const token = signUserToken({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'user'
    });
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      roles: ['Employee'],
      permissions: ['view_self'],
      isSuperAdmin: false
    });
  });

  it('accepts the access token from the cookie', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeUser as never);

    const token = signUserToken({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'user'
    });
    const res = await request(userApp).get('/protected').set('Cookie', `accessToken=${token}`);
    expect(res.status).toBe(200);
  });

  it('rejects an inactive user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...activeUser, status: 'inactive' } as never);

    const token = signUserToken({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'user'
    });
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_INACTIVE');
  });

  it('rejects a token whose user no longer exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const token = signUserToken({
      id: 'deleted-user',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'user'
    });
    const res = await request(userApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_INACTIVE');
  });
});

describe('authenticateAny', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.superAdmin.findUnique).mockReset();
  });

  it('authenticates a user token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeUser as never);

    const token = signUserToken({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'user'
    });
    const res = await request(anyApp).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.isSuperAdmin).toBe(false);
    expect(res.body.superAdmin).toBeUndefined();
  });

  it('rejects a user token without a type claim', async () => {
    const token = signUserToken({ id: 'user-1', email: 'user@example.com', orgId: 'org-1' });
    const res = await request(anyApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN_TYPE');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('authenticates a super-admin token', async () => {
    vi.mocked(prisma.superAdmin.findUnique).mockResolvedValue({
      id: 'sa-1',
      email: 'root@example.com',
      name: 'Root'
    } as never);

    const token = signSuperAdminToken({ id: 'sa-1', email: 'root@example.com', typ: 'super_admin' });
    const res = await request(anyApp).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.isSuperAdmin).toBe(true);
    expect(res.body.superAdmin).toMatchObject({ id: 'sa-1', email: 'root@example.com' });
  });

  it('does not accept a super-admin token with a user type claim', async () => {
    const token = signSuperAdminToken({ id: 'sa-1', email: 'root@example.com', typ: 'user' });
    const res = await request(anyApp).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });
});

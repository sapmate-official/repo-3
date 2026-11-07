import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../src/db/prisma.js', () => ({
  default: {
    superAdmin: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() }
  }
}));

import prisma from '../../src/db/prisma.js';
import { authenticateSuperAdmin } from '../../src/middleware/superAdminAuth.js';
import { env } from '../../src/config/env.js';

const app = express();
app.get('/protected', authenticateSuperAdmin, (req, res) => {
  res.status(200).json({ superAdmin: req.superAdmin });
});

const JWT_ISSUER = 'alkaa-backend-ts';
const JWT_AUDIENCE = 'alkaa-clients';

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

describe('authenticateSuperAdmin', () => {
  beforeEach(() => {
    vi.mocked(prisma.superAdmin.findUnique).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SUPERADMIN_TOKEN_MISSING');
  });

  it('rejects a regular user token', async () => {
    const token = jwt.sign(
      { id: 'user-1', email: 'user@example.com', orgId: 'org-1', typ: 'user' },
      env.USER_ACCESS_TOKEN_SECRET,
      { expiresIn: '15m' }
    );
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
    expect(prisma.superAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a super-admin token with the wrong type claim', async () => {
    const token = signSuperAdminToken({ id: 'sa-1', email: 'root@example.com', typ: 'user' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_TOKEN_TYPE');
    expect(prisma.superAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token for a super-admin that no longer exists', async () => {
    vi.mocked(prisma.superAdmin.findUnique).mockResolvedValue(null);
    const token = signSuperAdminToken({ id: 'sa-1', email: 'root@example.com', typ: 'super_admin' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUPERADMIN_NOT_FOUND');
  });

  it('authenticates a valid super-admin token', async () => {
    vi.mocked(prisma.superAdmin.findUnique).mockResolvedValue({
      id: 'sa-1',
      email: 'root@example.com',
      name: 'Root'
    } as never);

    const token = signSuperAdminToken({ id: 'sa-1', email: 'root@example.com', typ: 'super_admin' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.superAdmin).toMatchObject({ id: 'sa-1', email: 'root@example.com', isSuperAdmin: true });
  });

  it('rejects an expired super-admin token', async () => {
    const token = signSuperAdminToken(
      { id: 'sa-1', email: 'root@example.com', typ: 'super_admin' },
      { expiresIn: -120 }
    );
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

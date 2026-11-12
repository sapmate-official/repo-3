import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  superAdmin: { findUnique: vi.fn() }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

const app = createApp();

const signUserToken = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, env.USER_ACCESS_TOKEN_SECRET, {
    expiresIn: '15m',
    issuer: 'alkaa-backend-ts',
    audience: 'alkaa-clients'
  });

const authHeader = (user: { id: string; orgId: string; roles?: string[] }) => {
  const token = signUserToken({
    id: user.id,
    email: `${user.id}@example.test`,
    orgId: user.orgId,
    typ: 'user'
  });
  return `Bearer ${token}`;
};

const activeUser = (
  id: string,
  orgId: string,
  roles: { name: string; permissions?: string[] }[] = []
) => ({
  id,
  email: `${id}@example.test`,
  orgId,
  firstName: 'Test',
  lastName: 'User',
  status: 'active',
  roles: roles.map((role) => ({
    role: {
      name: role.name,
      permissions: (role.permissions ?? []).map((key) => ({
        permission: { key }
      }))
    }
  }))
});

describe('route authorization', () => {
  beforeEach(() => {
    vi.mocked(prismaMock.user.findUnique).mockReset();
    vi.mocked(prismaMock.superAdmin.findUnique).mockReset();
  });

  it('rejects organization role mutations without manage_role', async () => {
    vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
      activeUser('hr-user', 'org-a', [
        { name: 'HR Manager', permissions: ['view_employee_management', 'create_user'] }
      ])
    );

    const res = await request(app)
      .post('/api/v1/role')
      .set('Authorization', authHeader({ id: 'hr-user', orgId: 'org-a' }))
      .send({ name: 'Payroll Admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('rejects onboarding management without employee management permission', async () => {
    vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
      activeUser('employee-user', 'org-a', [
        { name: 'Employee', permissions: ['view_personal_info_to_myself'] }
      ])
    );

    const res = await request(app)
      .post('/api/v1/onboarding')
      .set('Authorization', authHeader({ id: 'employee-user', orgId: 'org-a' }))
      .send({ firstName: 'Test', email: 'candidate@example.test' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('rejects cross-tenant v2 user listing', async () => {
    vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
      activeUser('hr-user', 'org-a', [
        { name: 'HR Manager', permissions: ['view_employee_management'] }
      ])
    );

    const res = await request(app)
      .get('/api/v2/user/user-list?orgId=org-b')
      .set('Authorization', authHeader({ id: 'hr-user', orgId: 'org-a' }));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('rejects cross-tenant employee registration body', async () => {
    vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
      activeUser('hr-user', 'org-a', [
        { name: 'HR Manager', permissions: ['create_user'] }
      ])
    );

    const res = await request(app)
      .post('/api/v1/employee/register')
      .set('Authorization', authHeader({ id: 'hr-user', orgId: 'org-a' }))
      .send({ orgId: 'org-b', firstName: 'Test', email: 'test@example.test' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('rejects global permission mutations for organization users', async () => {
    vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
      activeUser('org-admin', 'org-a', [{ name: 'Org_Admin' }])
    );

    const res = await request(app)
      .post('/api/v1/permission')
      .set('Authorization', authHeader({ id: 'org-admin', orgId: 'org-a' }))
      .send({ name: 'New Permission', action: 'create' });

    expect(res.status).toBe(401);
  });
});

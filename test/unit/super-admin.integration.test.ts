import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';

// Hoisted Prisma mock
const prismaMock = vi.hoisted(() => ({
  superAdmin: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  organization: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  user: {
    count: vi.fn(),
    findMany: vi.fn()
  },
  billingRecord: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn()
  },
  subscriptionPlan: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

const authSessionMock = vi.hoisted(() => ({
  createSuperAdminSession: vi.fn().mockResolvedValue({
    accessToken: 'mock-super-admin-access-token',
    refreshToken: 'mock-super-admin-refresh-token'
  }),
  revokeSuperAdminSessions: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

vi.mock('../../src/modules/auth/authSession.service.js', () => authSessionMock);

import { createApp } from '../../src/app.js';
import { signSuperAdminAccessToken } from '../../src/modules/auth/token.service.js';

describe('SuperAdmin HTTP Integration Suite', () => {
  const app = createApp();

  const makeSuperAdminToken = (overrides: { id?: string; email?: string; sid?: string } = {}) =>
    signSuperAdminAccessToken({
      id: overrides.id ?? 'sa-1',
      email: overrides.email ?? 'superadmin@alkaa.online',
      sid: overrides.sid ?? 'session-1'
    });

  const makeUserToken = () =>
    jwt.sign(
      {
        id: 'user-1',
        email: 'user@alkaa.online',
        orgId: 'org-1',
        sid: 'session-user',
        typ: 'user'
      },
      env.USER_ACCESS_TOKEN_SECRET,
      { expiresIn: '1h', issuer: 'alkaa-backend-ts', audience: 'alkaa-clients' }
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Security & Access Protection', () => {
    it('blocks unauthenticated requests to protected super-admin routes', async () => {
      const res = await request(app).get('/api/v2/super-admin/organizations/stats');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SUPERADMIN_TOKEN_MISSING');
    });

    it('rejects regular user tokens on super-admin routes', async () => {
      const userToken = makeUserToken();
      const res = await request(app)
        .get('/api/v2/super-admin/organizations/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(401); // wrong secret or token type
    });

    it('rejects expired super-admin token', async () => {
      const expiredToken = jwt.sign(
        { id: 'sa-1', email: 'sa@alkaa.online', typ: 'super_admin' },
        env.SUPER_ADMIN_ACCESS_TOKEN_SECRET,
        { expiresIn: '-10s', issuer: 'alkaa-backend-ts', audience: 'alkaa-clients' }
      );

      const res = await request(app)
        .get('/api/v2/super-admin/organizations/stats')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('Route Parity & Functional Endpoints', () => {
    beforeEach(() => {
      prismaMock.superAdmin.findUnique.mockResolvedValue({
        id: 'sa-1',
        email: 'superadmin@alkaa.online',
        name: 'Chief SuperAdmin'
      });
    });

    it('GET /api/v2/super-admin/validate-token returns 200 with valid token', async () => {
      const token = makeSuperAdminToken();
      const res = await request(app)
        .get('/api/v2/super-admin/validate-token')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('validated successfully');
    });

    it('GET /api/v2/super-admin/get-user-info returns super admin profile', async () => {
      const token = makeSuperAdminToken();
      const res = await request(app)
        .get('/api/v2/super-admin/get-user-info')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userData.email).toBe('superadmin@alkaa.online');
    });

    it('GET /api/v2/super-admin/organizations/stats returns calculated stats', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 45);

      prismaMock.organization.findMany.mockResolvedValue([
        {
          id: 'org-1',
          name: 'ShapeNXT',
          subscriptionStart: new Date(),
          subscriptionEnd: future,
          isActive: true,
          subscriptionPlan: { name: 'Pro', monthlyPrice: 20 },
          _count: { users: 10, departments: 2 }
        }
      ]);

      const token = makeSuperAdminToken();
      const res = await request(app)
        .get('/api/v2/super-admin/organizations/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('ShapeNXT');
      expect(res.body[0].subscriptionStatus).toBe('Active');
    });

    it('GET /api/v2/super-admin/billing/statistics returns aggregated metrics', async () => {
      prismaMock.billingRecord.findMany.mockResolvedValue([
        { totalAmount: 1500, status: 'PAID' }
      ]);
      prismaMock.billingRecord.count.mockResolvedValue(1);

      const token = makeSuperAdminToken();
      const res = await request(app)
        .get('/api/v2/super-admin/billing/statistics')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.billing).toBeDefined();
      expect(res.body.billStatus).toBeDefined();
    });

    it('POST /api/v2/super-admin/organization/:id/bill generates new bill', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'ShapeNXT',
        subscriptionPlan: { monthlyPrice: 10, name: 'Standard' },
        _count: { users: 12 }
      });

      prismaMock.billingRecord.upsert.mockResolvedValue({
        id: 'bill-1',
        organizationId: 'org-1',
        month: 11,
        year: 2026,
        activeUserCount: 12,
        pricePerUser: 10,
        totalAmount: 120,
        status: 'UNPAID'
      });

      const token = makeSuperAdminToken();
      const res = await request(app)
        .post('/api/v2/super-admin/organization/org-1/bill')
        .set('Authorization', `Bearer ${token}`)
        .send({ month: 11, year: 2026 });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Bill generated successfully');
      expect(res.body.bill.totalAmount).toBe(120);
    });

    it('GET /api/v2/subscription-plan returns plan list', async () => {
      prismaMock.subscriptionPlan.findMany.mockResolvedValue([
        { id: 'plan-1', name: 'Starter', monthlyPrice: 10, annualPrice: 100 }
      ]);

      const res = await request(app).get('/api/v2/subscription-plan');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Starter');
    });

    it('GET /api/v2/organization/subscription-plans provides alias compatibility for frontend hook', async () => {
      prismaMock.subscriptionPlan.findMany.mockResolvedValue([
        { id: 'plan-1', name: 'Enterprise', monthlyPrice: 99, annualPrice: 999 }
      ]);

      const res = await request(app).get('/api/v2/organization/subscription-plans');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Enterprise');
    });
  });
});

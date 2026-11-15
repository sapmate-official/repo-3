import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';

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
  }
}));

const authSessionMock = vi.hoisted(() => ({
  createSuperAdminSession: vi.fn(),
  revokeSuperAdminSessions: vi.fn()
}));

const emailMock = vi.hoisted(() => ({
  EmailService: {
    sendBillingInvoiceEmail: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

vi.mock('../../src/modules/auth/authSession.service.js', () => authSessionMock);
vi.mock('../../src/services/email.service.js', () => emailMock);

import { SuperAdminController } from '../../src/modules/super-admin/super-admin.controller.js';

describe('SuperAdminController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    res.clearCookie = vi.fn().mockReturnValue(res);
    return res;
  };

  const next: NextFunction = vi.fn();

  describe('Authentication flows', () => {
    it('authenticates valid super admin credentials and issues session cookies', async () => {
      const hashed = await bcrypt.hash('Secret123!', 10);
      prismaMock.superAdmin.findFirst.mockResolvedValue({
        id: 'sa-1',
        email: 'admin@alkaa.online',
        name: 'Master Admin',
        hashedPassword: hashed
      });

      authSessionMock.createSuperAdminSession.mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token'
      });

      const req = {
        body: { email: 'admin@alkaa.online', password: 'Secret123!' },
        header: vi.fn().mockReturnValue('test-agent'),
        ip: '127.0.0.1'
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-access-token', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('superAdminToken', 'mock-access-token', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-refresh-token', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Super Admin logged in successfully',
          accessToken: 'mock-access-token'
        })
      );
    });

    it('rejects login with invalid password', async () => {
      const hashed = await bcrypt.hash('CorrectPassword', 10);
      prismaMock.superAdmin.findFirst.mockResolvedValue({
        id: 'sa-1',
        email: 'admin@alkaa.online',
        hashedPassword: hashed
      });

      const req = {
        body: { email: 'admin@alkaa.online', password: 'WrongPassword' }
      } as Request;
      const res = mockRes();

      await SuperAdminController.login(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid credentials'
        })
      );
    });

    it('logs out and revokes super admin session', async () => {
      const req = {
        superAdmin: { id: 'sa-1', email: 'admin@alkaa.online', name: 'Master', isSuperAdmin: true }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.logout(req, res, next);

      expect(authSessionMock.revokeSuperAdminSessions).toHaveBeenCalledWith('sa-1');
      expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Organization Tracking & Stats', () => {
    it('computes daysRemaining and subscriptionStatus across organizations', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      prismaMock.organization.findMany.mockResolvedValue([
        {
          id: 'org-active',
          name: 'ShapeNXT',
          subscriptionStart: new Date(),
          subscriptionEnd: futureDate,
          isActive: true,
          subscriptionPlan: { name: 'Enterprise', monthlyPrice: 50 },
          _count: { users: 25, departments: 3 }
        },
        {
          id: 'org-expired',
          name: 'Old Org',
          subscriptionStart: new Date(),
          subscriptionEnd: pastDate,
          isActive: true,
          subscriptionPlan: null,
          _count: { users: 5, departments: 1 }
        }
      ]);

      const req = {} as Request;
      const res = mockRes();

      await SuperAdminController.getOrganizationsStats(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCalls = (res.json as any).mock.calls[0][0];
      expect(jsonCalls).toHaveLength(2);
      expect(jsonCalls[0].subscriptionStatus).toBe('Active');
      expect(jsonCalls[1].subscriptionStatus).toBe('Expired');
    });

    it('returns detailed organization breakdown', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'ShapeNXT',
        subscriptionEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20),
        subscriptionPlan: { name: 'Growth', monthlyPrice: 20 },
        departments: [{ id: 'dept-1', name: 'Engineering', _count: { users: 10 } }],
        roles: [{ id: 'role-1', name: 'Developer', _count: { users: 8 } }],
        _count: { users: 15, departments: 1, roles: 1 }
      });

      const req = { params: { id: 'org-1' } } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.getOrganizationDetails(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ShapeNXT',
          subscriptionMetrics: expect.objectContaining({
            subscriptionStatus: 'Active'
          })
        })
      );
    });
  });

  describe('Organization Billing Operations', () => {
    it('generates bill based on active users and subscription plan price', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'ShapeNXT',
        subscriptionPlan: { name: 'Growth', monthlyPrice: 15 },
        _count: { users: 20 }
      });

      const upsertedBill = {
        id: 'bill-1',
        organizationId: 'org-1',
        month: 11,
        year: 2026,
        activeUserCount: 20,
        pricePerUser: 15,
        totalAmount: 300,
        status: 'UNPAID'
      };
      prismaMock.billingRecord.upsert.mockResolvedValue(upsertedBill);

      const req = {
        params: { id: 'org-1' },
        body: { month: 11, year: 2026 }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.generateOrganizationBill(req, res, next);

      expect(prismaMock.billingRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_month_year: {
              organizationId: 'org-1',
              month: 11,
              year: 2026
            }
          }
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('updates bill status to PAID and records payment timestamp', async () => {
      prismaMock.billingRecord.findUnique.mockResolvedValue({
        id: 'bill-1',
        status: 'UNPAID'
      });
      prismaMock.billingRecord.update.mockResolvedValue({
        id: 'bill-1',
        status: 'PAID',
        paidDate: new Date(),
        paymentReference: 'REF-123'
      });

      const req = {
        params: { id: 'bill-1' },
        body: { status: 'PAID', paymentReference: 'REF-123', notes: 'Wire transfer' }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.updateBillStatus(req, res, next);

      expect(prismaMock.billingRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bill-1' },
          data: expect.objectContaining({
            status: 'PAID',
            paymentReference: 'REF-123'
          })
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('aggregates platform billing statistics', async () => {
      prismaMock.billingRecord.findMany.mockImplementation((args: any) => {
        if (args?.select?.organizationId) {
          // pendingBills
          return Promise.resolve([
            { organizationId: 'org-1', organization: { name: 'Acme' }, totalAmount: 100, dueDate: new Date() }
          ]);
        }
        // thisMonthBills
        return Promise.resolve([
          { totalAmount: 500, status: 'PAID' },
          { totalAmount: 500, status: 'UNPAID' }
        ]);
      });

      prismaMock.billingRecord.count.mockImplementation((args: any) => {
        if (args?.where?.status === 'PAID') return Promise.resolve(10);
        if (args?.where?.status === 'UNPAID') return Promise.resolve(5);
        if (args?.where?.status === 'OVERDUE') return Promise.resolve(1);
        return Promise.resolve(16);
      });

      const req = {} as Request;
      const res = mockRes();

      await SuperAdminController.getBillingStatistics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          billing: expect.objectContaining({
            totalBilledThisMonth: 1000,
            totalPaidThisMonth: 500,
            collectionRate: 50
          }),
          billStatus: expect.objectContaining({
            paid: 10,
            unpaid: 5,
            overdue: 1
          })
        })
      );
    });
  });
});

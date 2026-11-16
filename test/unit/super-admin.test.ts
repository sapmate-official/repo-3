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

describe('SuperAdminController Comprehensive Suite', () => {
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

  describe('Authentication & Session Management', () => {
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

    it('rejects login with non-existent email', async () => {
      prismaMock.superAdmin.findFirst.mockResolvedValue(null);

      const req = {
        body: { email: 'nonexistent@alkaa.online', password: 'Password123!' }
      } as Request;
      const res = mockRes();

      await SuperAdminController.login(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No super admin exists with this Email'
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

    it('validates current super admin session token', () => {
      const req = {
        superAdmin: { id: 'sa-1', email: 'admin@alkaa.online', name: 'Master', isSuperAdmin: true }
      } as unknown as Request;
      const res = mockRes();

      SuperAdminController.validateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Super Admin token validated successfully'
        })
      );
    });

    it('returns authenticated user information', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValue({
        id: 'sa-1',
        email: 'admin@alkaa.online',
        name: 'Master Admin',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const req = {
        superAdmin: { id: 'sa-1', email: 'admin@alkaa.online', name: 'Master Admin', isSuperAdmin: true }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.getUserInfo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          userData: expect.objectContaining({
            id: 'sa-1',
            email: 'admin@alkaa.online'
          })
        })
      );
    });
  });

  describe('SuperAdmin Account Management CRUD', () => {
    it('lists all super admins', async () => {
      const admins = [
        { id: 'sa-1', email: 'admin1@alkaa.online', name: 'Admin 1', createdAt: new Date() },
        { id: 'sa-2', email: 'admin2@alkaa.online', name: 'Admin 2', createdAt: new Date() }
      ];
      prismaMock.superAdmin.findMany.mockResolvedValue(admins);

      const req = {} as Request;
      const res = mockRes();

      await SuperAdminController.getSuperAdmins(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(admins);
    });

    it('retrieves single super admin by ID', async () => {
      const admin = { id: 'sa-1', email: 'admin@alkaa.online', name: 'Admin', createdAt: new Date() };
      prismaMock.superAdmin.findUnique.mockResolvedValue(admin);

      const req = { params: { id: 'sa-1' } } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.getSuperAdminById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(admin);
    });

    it('creates super admin when valid secretKey is provided', async () => {
      process.env.SUPER_ADMIN_SECRET_KEY = 'test-secret-key-123';
      prismaMock.superAdmin.findUnique.mockResolvedValue(null);
      prismaMock.superAdmin.create.mockResolvedValue({
        id: 'sa-new',
        email: 'newadmin@alkaa.online',
        name: 'New Admin',
        createdAt: new Date()
      });

      const req = {
        body: {
          email: 'newadmin@alkaa.online',
          name: 'New Admin',
          password: 'Password123!',
          secretKey: 'test-secret-key-123'
        }
      } as Request;
      const res = mockRes();

      await SuperAdminController.createSuperAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Super admin created successfully'
        })
      );
    });

    it('rejects creating super admin with invalid secretKey and no active session', async () => {
      process.env.SUPER_ADMIN_SECRET_KEY = 'correct-key';

      const req = {
        body: {
          email: 'hacker@example.com',
          name: 'Intruder',
          password: 'Password123!',
          secretKey: 'wrong-key'
        }
      } as Request;
      const res = mockRes();

      await SuperAdminController.createSuperAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Unauthorized')
        })
      );
    });

    it('prevents super admin from deleting their own account', async () => {
      const req = {
        params: { id: 'sa-1' },
        superAdmin: { id: 'sa-1', email: 'admin@alkaa.online', name: 'Admin', isSuperAdmin: true }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.deleteSuperAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Cannot delete your own super admin account'
        })
      );
    });

    it('deletes another super admin account successfully', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValue({ id: 'sa-2' });
      prismaMock.superAdmin.delete.mockResolvedValue({ id: 'sa-2' });

      const req = {
        params: { id: 'sa-2' },
        superAdmin: { id: 'sa-1', email: 'admin@alkaa.online', name: 'Admin', isSuperAdmin: true }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.deleteSuperAdmin(req, res, next);

      expect(prismaMock.superAdmin.delete).toHaveBeenCalledWith({ where: { id: 'sa-2' } });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Organization Tracking & User Listing', () => {
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
      const jsonCalls = vi.mocked(res.json).mock.calls[0]?.[0] as { subscriptionStatus: string }[] | undefined;
      expect(jsonCalls).toBeDefined();
      expect(jsonCalls).toHaveLength(2);
      expect(jsonCalls?.[0]?.subscriptionStatus).toBe('Active');
      expect(jsonCalls?.[1]?.subscriptionStatus).toBe('Expired');
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

    it('retrieves paginated organization users', async () => {
      prismaMock.user.count.mockResolvedValue(42);
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          email: 'user1@shapenxt.com',
          firstName: 'Alice',
          lastName: 'Smith',
          status: 'active',
          roles: [{ role: { id: 'r-1', name: 'Employee' } }],
          department: { id: 'd-1', name: 'Tech' }
        }
      ]);

      const req = {
        params: { id: 'org-1' },
        query: { page: '2', limit: '10' }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.getOrganizationUsers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            total: 42,
            page: 2,
            limit: 10,
            pages: 5
          }
        })
      );
    });

    it('retrieves admin users of an organization', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'u-admin',
          email: 'admin@shapenxt.com',
          firstName: 'Bob',
          lastName: 'Admin',
          employeeId: 'EMP-001',
          roles: [{ role: { id: 'r-admin', name: 'Org_Admin' } }]
        }
      ]);

      const req = { params: { id: 'org-1' } } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.getOrganizationAdmins(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const admins = vi.mocked(res.json).mock.calls[0]?.[0] as { roles: { name: string }[] }[] | undefined;
      expect(admins).toBeDefined();
      expect(admins).toHaveLength(1);
      expect(admins?.[0]?.roles[0]?.name).toBe('Org_Admin');
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

    it('dispatches bill email to organization admins', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'ShapeNXT',
        subscriptionPlan: { name: 'Growth', monthlyPrice: 15 }
      });

      prismaMock.billingRecord.findUnique.mockResolvedValue({
        id: 'bill-1',
        month: 11,
        year: 2026,
        totalAmount: 300,
        activeUserCount: 20,
        pricePerUser: 15,
        dueDate: new Date()
      });

      prismaMock.user.findMany.mockResolvedValue([
        { email: 'admin1@shapenxt.com' },
        { email: 'admin2@shapenxt.com' }
      ]);

      const req = {
        params: { id: 'org-1' },
        body: { billId: 'bill-1' }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.sendBillEmail(req, res, next);

      expect(emailMock.EmailService.sendBillingInvoiceEmail).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: ['admin1@shapenxt.com', 'admin2@shapenxt.com']
        })
      );
    });

    it('batch generates and dispatches bills to all active organizations', async () => {
      prismaMock.organization.findMany.mockResolvedValue([
        {
          id: 'org-1',
          name: 'ShapeNXT',
          subscriptionPlan: { monthlyPrice: 10, name: 'Pro' },
          _count: { users: 10 }
        }
      ]);

      prismaMock.billingRecord.upsert.mockResolvedValue({
        id: 'bill-1',
        month: 11,
        year: 2026,
        totalAmount: 100,
        activeUserCount: 10,
        pricePerUser: 10,
        dueDate: new Date()
      });

      prismaMock.user.findMany.mockResolvedValue([{ email: 'admin@shapenxt.com' }]);

      const req = {
        body: { month: 11, year: 2026 }
      } as Request;
      const res = mockRes();

      await SuperAdminController.sendBillsToAllOrganizations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Processed billing for 1 organization(s)'
        })
      );
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

    it('processes bill payment and updates record', async () => {
      prismaMock.billingRecord.findUnique.mockResolvedValue({ id: 'bill-1' });
      prismaMock.billingRecord.update.mockResolvedValue({
        id: 'bill-1',
        status: 'PAID',
        paymentReference: 'MANUAL-PAY'
      });

      const req = {
        params: { id: 'bill-1' },
        body: { paymentReference: 'MANUAL-PAY' }
      } as unknown as Request;
      const res = mockRes();

      await SuperAdminController.processBillPayment(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Payment processed successfully'
        })
      );
    });

    it('aggregates platform billing statistics', async () => {
      prismaMock.billingRecord.findMany.mockImplementation((args: { select?: { organizationId?: boolean } } | undefined) => {
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

      prismaMock.billingRecord.count.mockImplementation((args: { where?: { status?: string } } | undefined) => {
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

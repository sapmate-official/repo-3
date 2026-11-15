import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';

// Hoisted Prisma mock
const prismaMock = vi.hoisted(() => ({
  billingRecord: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn()
  },
  organization: {
    findUnique: vi.fn(),
    findFirst: vi.fn()
  },
  payrollRun: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  payslipRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn()
  },
  payslipLineItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn()
  },
  salaryRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn()
  },
  salaryParameter: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn()
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn()
  },
  attendanceRecord: {
    count: vi.fn(),
    findMany: vi.fn()
  },
  leaveRequest: {
    findMany: vi.fn()
  },
  activityLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn()
  },
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn()
  },
  notificationTemplate: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  organizationSettings: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn()
  },
  permissionPreset: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  role: {
    findUnique: vi.fn(),
    findMany: vi.fn()
  },
  rolePermission: {
    findMany: vi.fn()
  },
  permission: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  onboardingCandidate: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { createApp } from '../../src/app.js';

const app = createApp();
const allowedOrigin = env.CORS_ORIGINS.split(',')[0]!.trim();

const generateAuthToken = (payload: {
  id?: string;
  email?: string;
  orgId?: string;
  roleId?: string;
  permissions?: string[];
}) => {
  return jwt.sign(
    {
      id: payload.id ?? 'user-123',
      email: payload.email ?? 'dev@example.com',
      orgId: payload.orgId ?? 'org-123',
      roleId: payload.roleId ?? 'role-admin',
      permissions: payload.permissions ?? ['*'],
      typ: 'user'
    },
    env.USER_ACCESS_TOKEN_SECRET,
    {
      expiresIn: '15m',
      issuer: 'alkaa-backend-ts',
      audience: 'alkaa-clients'
    }
  );
};

describe('Comprehensive Routes & Error Handling Integration Suite', () => {
  let validToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    validToken = generateAuthToken({});

    // Default active user mock for authentication & org resolution
    prismaMock.user.findUnique.mockImplementation(({ where }) => {
      const targetId = where.id ?? 'user-123';
      return {
        id: targetId,
        email: 'dev@example.com',
        employeeId: 'EMP-001',
        orgId: 'org-123',
        firstName: 'Soumabrata',
        lastName: 'Ghosh',
        monthlySalary: 75000,
        status: 'active',
        department: { name: 'Information Technology' },
        salaryParameter: {
          hraPercentage: 40,
          daPercentage: 10,
          taPercentage: 10,
          pfPercentage: 12,
          tdsPercentage: 10
        },
        bankDetails: {
          accountNumber: '9876543210',
          bankName: 'State Bank',
          ifscCode: 'SBIN0001'
        },
        roles: [
          {
            role: {
              name: 'ADMIN',
              permissions: [
                { permission: { key: '*' } },
                { permission: { key: 'user.read' } },
                { permission: { key: 'user.write' } },
                { permission: { key: 'payroll.manage' } }
              ]
            }
          }
        ]
      };
    });
  });

  // ==========================================
  // 1. Central Error Handling & Protocol Tests
  // ==========================================
  describe('Central Error Handling & Protocol Standards', () => {
    it('returns structured 400 response for malformed JSON request bodies', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', allowedOrigin)
        .send('{ "email": "test@example.com", '); // malformed

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        code: 'INVALID_JSON'
      });
      expect(typeof res.body.message).toBe('string');
      expect(typeof res.body.requestId).toBe('string');
    });

    it('returns structured 401 response when protected route is called without token', async () => {
      const res = await request(app)
        .get('/api/v2/billing/dashboard')
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        code: 'TOKEN_MISSING'
      });
    });

    it('returns structured 401 response for expired or invalid token', async () => {
      const res = await request(app)
        .get('/api/v2/billing/dashboard')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false
      });
    });

    it('rejects state-changing requests from untrusted CORS origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://malicious-site.com')
        .send({ email: 'test@example.com', password: 'Password123!' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        success: false
      });
    });
  });

  // ==========================================
  // 2. Public Endpoints
  // ==========================================
  describe('Public Endpoints (Platform & Public Billing)', () => {
    it('GET /health returns 200 with service health metadata', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'OK',
        service: 'alkaa-backend-ts'
      });
    });

    it('GET /api/public/billing/:id returns formatted bill without auth', async () => {
      prismaMock.billingRecord.findUnique.mockResolvedValue({
        id: 'bill-pub-1',
        organizationId: 'org-pub-1',
        totalAmount: 15000,
        status: 'UNPAID',
        month: 11,
        year: 2026,
        organization: {
          name: 'Acme Public Corp',
          logo: 'https://example.com/logo.png',
          subscriptionPlanId: 'plan-1',
          subscriptionPlan: { name: 'Enterprise' }
        }
      });

      const res = await request(app).get('/api/public/billing/bill-pub-1');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: 'bill-pub-1',
          totalAmount: 15000,
          organizationName: 'Acme Public Corp',
          subscriptionPlan: 'Enterprise'
        })
      });
    });

    it('GET /api/public/billing/:id returns 404 when bill does not exist', async () => {
      prismaMock.billingRecord.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/public/billing/non-existent-bill');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        code: 'NOT_FOUND'
      });
    });

    it('POST /api/public/billing/:id/payment processes public payment', async () => {
      prismaMock.billingRecord.findUnique.mockResolvedValue({
        id: 'bill-pub-1',
        status: 'UNPAID',
        totalAmount: 15000
      });
      prismaMock.billingRecord.update.mockResolvedValue({
        id: 'bill-pub-1',
        status: 'PAID',
        paidDate: new Date()
      });

      const res = await request(app)
        .post('/api/public/billing/bill-pub-1/payment')
        .set('Origin', allowedOrigin)
        .send({ paymentMethod: 'UPI', paymentReference: 'UPI-123456' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Bill payment recorded successfully',
        data: expect.objectContaining({ status: 'PAID' })
      });
    });
  });

  // ==========================================
  // 3. Billing Module Routes (/api/v2/billing/*)
  // ==========================================
  describe('Billing Management Routes (/api/v2/billing/*)', () => {
    it('GET /api/v2/billing/dashboard returns comprehensive dashboard statistics', async () => {
      prismaMock.billingRecord.findMany.mockResolvedValue([
        {
          id: 'bill-1',
          organizationId: 'org-123',
          totalAmount: 50000,
          status: 'PAID',
          year: 2026,
          month: 11
        },
        {
          id: 'bill-2',
          organizationId: 'org-123',
          totalAmount: 25000,
          status: 'UNPAID',
          year: 2026,
          month: 10
        }
      ]);

      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        name: 'Tech Innovators',
        subscriptionPlanId: 'plan-pro',
        subscriptionPlan: {
          id: 'plan-pro',
          name: 'Pro Tier',
          monthlyPrice: 25000,
          annualPrice: 250000,
          maxUsers: 50,
          features: []
        },
        subscriptionStart: new Date('2026-01-01'),
        subscriptionEnd: new Date('2026-12-31'),
        _count: { users: 35 }
      });

      const res = await request(app)
        .get('/api/v2/billing/dashboard')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          organization: expect.objectContaining({
            name: 'Tech Innovators',
            subscriptionPlan: 'Pro Tier',
            activeUsers: 35
          }),
          billing: expect.objectContaining({
            totalBilledThisYear: 75000,
            totalUnpaid: 25000,
            unpaidCount: 1
          }),
          billStatus: expect.objectContaining({
            unpaid: 1,
            paid: 1,
            total: 2
          }),
          recentBills: expect.any(Array)
        }
      });
    });

    it('GET /api/v2/billing/history returns paginated bills', async () => {
      prismaMock.billingRecord.count.mockResolvedValue(1);
      prismaMock.billingRecord.findMany.mockResolvedValue([
        {
          id: 'b-1',
          organizationId: 'org-123',
          totalAmount: 20000,
          status: 'PAID',
          year: 2026,
          month: 11
        }
      ]);

      const res = await request(app)
        .get('/api/v2/billing/history?page=1&limit=10')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([expect.objectContaining({ id: 'b-1', monthName: 'November' })]),
        pagination: expect.objectContaining({ total: 1, page: 1, limit: 10 })
      });
    });

    it('GET /api/v2/billing/bill/:id/invoice returns PDF buffer with application/pdf header', async () => {
      prismaMock.billingRecord.findFirst.mockResolvedValue({
        id: 'bill-1',
        organizationId: 'org-123',
        totalAmount: 12000,
        status: 'PAID',
        month: 11,
        year: 2026,
        userCount: 10,
        pricePerUser: 1200,
        paidDate: new Date('2026-11-10'),
        paymentReference: 'TXN-998877',
        organization: {
          name: 'Innovate Labs',
          email: 'admin@innovate.com',
          subscriptionPlan: { name: 'Growth Plan' }
        }
      });

      const res = await request(app)
        .get('/api/v2/billing/bill/bill-1/invoice')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="invoice-bill-1.pdf"');
    });
  });

  // ==========================================
  // 4. Payroll Routes (/api/v3/payroll/* & v2)
  // ==========================================
  describe('Payroll System Routes (/api/v3/payroll & /api/v2/payroll)', () => {
    it('GET /api/v3/payroll/payslip/11/2026/undefined returns empty array instead of 404 when no payslip exists', async () => {
      prismaMock.payslipRecord.findMany.mockResolvedValue([]);
      prismaMock.salaryRecord.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v3/payroll/payslip/11/2026/undefined')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        count: 0,
        data: []
      });
    });

    it('GET /api/v3/payroll/payslip/11/2026 returns populated payslip records when available', async () => {
      prismaMock.payslipRecord.findMany.mockResolvedValue([
        {
          id: 'ps-1',
          employeeId: 'user-123',
          grossEarnings: 65000,
          netPay: 58000,
          totalDeductions: 7000,
          createdAt: new Date('2026-11-15T00:00:00.000Z'),
          employee: {
            id: 'user-123',
            firstName: 'Soumabrata',
            lastName: 'Ghosh',
            employeeId: 'ST2611001',
            department: { name: 'Information Technology' },
            bankDetails: {
              accountNumber: '9876543210',
              bankName: 'State Bank',
              ifscCode: 'SBIN0001'
            }
          },
          run: {
            month: 11,
            year: 2026,
            status: 'APPROVED',
            disbursedAt: null
          },
          lineItems: [
            { componentCode: 'BASIC', category: 'EARNING', finalAmount: 40000 },
            { componentCode: 'HRA', category: 'EARNING', finalAmount: 25000 },
            { componentCode: 'TDS', category: 'DEDUCTION', finalAmount: 7000 }
          ]
        }
      ]);

      const res = await request(app)
        .get('/api/v3/payroll/payslip/11/2026')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        count: 1,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'ps-1',
            userId: 'user-123',
            basicSalary: 40000,
            netSalary: 58000,
            employee: expect.objectContaining({
              firstName: 'Soumabrata',
              employeeId: 'ST2611001'
            })
          })
        ])
      });
    });

    it('POST /api/v3/payroll/salary-generate/11/2026 generates pay run and returns formatted payslip', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        orgId: 'org-123',
        status: 'active',
        firstName: 'Soumabrata',
        lastName: 'Ghosh',
        email: 'dev@example.com',
        monthlySalary: 75000,
        department: { name: 'Information Technology' },
        roles: [
          {
            role: {
              name: 'ADMIN',
              permissions: [{ permission: { key: '*' } }]
            }
          }
        ],
        salaryParameter: {
          hraPercentage: 40,
          daPercentage: 10,
          taPercentage: 10,
          pfPercentage: 12,
          tdsPercentage: 10
        },
        bankDetails: {
          accountNumber: '9876543210',
          bankName: 'State Bank',
          ifscCode: 'SBIN0001'
        }
      });
      prismaMock.attendanceRecord.count.mockResolvedValue(21);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);
      prismaMock.payrollRun.findUnique.mockResolvedValue(null);
      prismaMock.payrollRun.create.mockResolvedValue({
        id: 'run-nov-2026',
        companyId: 'org-123',
        year: 2026,
        month: 11,
        status: 'PENDING_REVIEW'
      });
      prismaMock.payslipRecord.findUnique.mockResolvedValue(null);
      prismaMock.payslipRecord.create.mockResolvedValue({
        id: 'payslip-gen-123',
        createdAt: new Date('2026-11-15T00:00:00.000Z')
      });
      prismaMock.salaryRecord.upsert.mockResolvedValue({ id: 'sal-1' });

      const res = await request(app)
        .post('/api/v3/payroll/salary-generate/11/2026/undefined')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Salary generated successfully',
        data: expect.objectContaining({
          id: 'payslip-gen-123',
          userId: 'user-123',
          month: 11,
          year: 2026,
          basicSalary: 75000
        })
      });
    });

    it('GET /api/v3/payroll/statistics/:salaryRecordId returns detailed breakdown and attendance', async () => {
      prismaMock.payslipRecord.findUnique.mockResolvedValue({
        id: 'rec-stat-1',
        employeeId: 'user-123',
        grossEarnings: 75000,
        netPay: 67500,
        totalDeductions: 7500,
        workingDays: 21,
        presentDays: 20,
        lopDays: 1,
        run: {
          month: 11,
          year: 2026,
          status: 'DISBURSED',
          disbursedAt: new Date('2026-11-15T12:00:00Z')
        },
        employee: {
          id: 'user-123',
          firstName: 'Soumabrata',
          lastName: 'Ghosh',
          email: 'dev@example.com',
          employeeId: 'ST2611001',
          department: { name: 'Engineering' }
        },
        lineItems: [
          { componentCode: 'BASIC', category: 'EARNING', finalAmount: 45000 },
          { componentCode: 'HRA', category: 'EARNING', finalAmount: 30000 },
          { componentCode: 'TDS', category: 'DEDUCTION', finalAmount: 7500 }
        ]
      });

      const res = await request(app)
        .get('/api/v3/payroll/statistics/rec-stat-1')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          basicInfo: expect.objectContaining({
            salaryRecordId: 'rec-stat-1',
            month: 11,
            monthName: 'November',
            year: 2026,
            status: 'DISBURSED'
          }),
          salaryBreakdown: expect.objectContaining({
            basicSalary: 45000,
            netSalary: 67500,
            taxAmount: 7500
          }),
          attendanceAnalysis: expect.objectContaining({
            workingDays: 21,
            presentDays: 20,
            absentDays: 1
          })
        }
      });
    });

    it('DELETE /api/v2/payroll/:id deletes payslip record and line items', async () => {
      prismaMock.payslipRecord.findUnique.mockResolvedValue({ id: 'ps-del-1' });
      prismaMock.payslipLineItem.deleteMany.mockResolvedValue({ count: 3 });
      prismaMock.payslipRecord.delete.mockResolvedValue({ id: 'ps-del-1' });

      const res = await request(app)
        .delete('/api/v2/payroll/ps-del-1')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Payslip record deleted successfully'
      });
    });

    it('GET /api/v2/payroll/user/:userId returns list of payslips for user', async () => {
      prismaMock.payslipRecord.findMany.mockResolvedValue([
        {
          id: 'p-1',
          employeeId: 'user-123',
          grossEarnings: 60000,
          netPay: 55000,
          createdAt: new Date('2026-11-15T00:00:00.000Z'),
          run: { month: 11, year: 2026, status: 'APPROVED', disbursedAt: null },
          lineItems: []
        }
      ]);

      const res = await request(app)
        .get('/api/v2/payroll/user/user-123')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        count: 1,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'p-1', userId: 'user-123', netSalary: 55000 })
        ])
      });
    });
  });

  // ==========================================
  // 5. Activity Logs, Events & Notifications
  // ==========================================
  describe('Activity Logs, Events & Notifications (/api/v2/*)', () => {
    it('GET /api/v2/events aggregates upcoming events', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);
      prismaMock.billingRecord.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v2/events')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: expect.any(Array)
      });
    });

    it('GET /api/v2/activity-logs returns scoped audit logs', async () => {
      prismaMock.activityLog.count.mockResolvedValue(1);
      prismaMock.activityLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          orgId: 'org-123',
          action: 'LOGIN',
          createdAt: new Date()
        }
      ]);

      const res = await request(app)
        .get('/api/v2/activity-logs')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([expect.objectContaining({ id: 'log-1', action: 'LOGIN' })])
      });
    });

    it('GET /api/v2/notification returns user notifications', async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          recipientId: 'user-123',
          title: 'Payslip Ready',
          message: 'Your November 2026 payslip has been generated.',
          isRead: false,
          createdAt: new Date()
        }
      ]);

      const res = await request(app)
        .get('/api/v2/notification')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'notif-1', isRead: false })
        ])
      });
    });
  });

  // ==========================================
  // 6. Settings & Permission Presets (/api/v3/*)
  // ==========================================
  describe('Settings & Permission Presets (/api/v3/*)', () => {
    it('GET /api/v3/settings returns organization settings', async () => {
      prismaMock.organizationSettings.findFirst.mockResolvedValue({
        id: 'settings-1',
        orgId: 'org-123',
        settings: { weekoff: [0, 6] }
      });

      const res = await request(app)
        .get('/api/v3/settings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'settings-1',
        orgId: 'org-123',
        settings: { weekoff: [0, 6] }
      });
    });

    it('GET /api/v3/permission-preset returns presets for org', async () => {
      prismaMock.permissionPreset.findMany.mockResolvedValue([
        {
          id: 'preset-1',
          name: 'HR Manager',
          orgId: 'org-123',
          permissions: ['user.read', 'payroll.manage']
        }
      ]);

      const res = await request(app)
        .get('/api/v3/permission-preset')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', allowedOrigin);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'preset-1', name: 'HR Manager' })
        ])
      );
    });
  });
});

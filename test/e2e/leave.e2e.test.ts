/**
 * Database-backed integration tests for leave types, requests, approvals,
 * balances, and tenant/self scoping.
 *
 * Run only against an explicit development database/branch:
 *
 *   $env:RUN_E2E = '1'
 *   $env:TEST_DATABASE_URL = 'postgresql://...'   # a dev Neon branch, never prod
 *   npm run test:e2e
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { type Response as SupertestResponse } from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';

process.env.BREVO_API_KEY = '';

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

const dateKey = (offsetDays: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

describeE2E('leave authorization integration (database)', () => {
  let app: Express;
  let prisma: PrismaClient;

  const orgIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const permissionIds: string[] = [];

  let organizationId: string;
  let employeeCookie: string;
  let managerCookie: string;
  let hrCookie: string;
  let otherEmployeeCookie: string;
  let orgAdminCookie: string;

  let employeeId: string;
  let otherEmployeeId: string;
  let managerId: string;
  let orgAdminId: string;
  let annualLeaveTypeId: string;
  let approvedRequestId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password, orgId: organizationId });
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
    process.env.BREVO_API_KEY = '';

    const appModule = await import('../../src/app.js');
    const prismaModule = await import('../../src/db/prisma.js');

    app = appModule.createApp();
    prisma = prismaModule.default;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hashedPassword = await bcrypt.hash(password, 10);

    const organization = await prisma.organization.create({
      data: { name: `E2E Leave Org ${suffix}` }
    });
    organizationId = organization.id;
    orgIds.push(organization.id);

    const permissionKeys = [
      'read_leave_type',
      'leave_type_create',
      'update_leave_types',
      'delete_leave_type',
      'leave_request',
      'approve_leave',
      'reject_leave',
      'view_subordinates_leave',
      'view_all_user_leave',
      'view_leave_balance',
      'manage_leave_balance'
    ];
    const permissions = await Promise.all(
      permissionKeys.map((key) =>
        prisma.permission.create({
          data: {
            name: `E2E ${key} ${suffix}`,
            module: 'Leave',
            action: key.split('_')[0]!,
            key
          }
        })
      )
    );
    permissionIds.push(...permissions.map((permission) => permission.id));
    const permissionByKey = new Map(
      permissions.map((permission) => [permission.key, permission])
    );
    const connectPermission = (key: string) => ({
      permission: { connect: { id: permissionByKey.get(key)!.id } }
    });

    const employeeRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E Employee ${suffix}`,
        description: 'Employee with leave self-service access',
        permissions: {
          create: ['leave_request', 'view_leave_balance'].map(connectPermission)
        }
      }
    });
    const managerRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E Manager ${suffix}`,
        description: 'Manager with direct-report leave access',
        permissions: {
          create: [
            'leave_request',
            'view_leave_balance',
            'approve_leave',
            'reject_leave',
            'view_subordinates_leave'
          ].map(connectPermission)
        }
      }
    });
    const hrRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E HR ${suffix}`,
        description: 'HR with leave administration access',
        permissions: {
          create: [
            'read_leave_type',
            'leave_type_create',
            'update_leave_types',
            'delete_leave_type',
            'leave_request',
            'view_all_user_leave',
            'view_leave_balance',
            'manage_leave_balance'
          ].map(connectPermission)
        }
      }
    });
    const orgAdminRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: 'Org_Admin',
        description: 'Organization administrator role'
      }
    });
    roleIds.push(employeeRole.id, managerRole.id, hrRole.id, orgAdminRole.id);

    const manager = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-leave-manager-${suffix}@example.test`,
        employeeId: `E2ELM-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Manager',
        status: 'active',
        twoFactorEnabled: false,
        roles: {
          create: [{ role: { connect: { id: managerRole.id } } }]
        }
      }
    });
    managerId = manager.id;

    const employee = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-leave-employee-${suffix}@example.test`,
        employeeId: `E2ELE-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Employee',
        status: 'active',
        twoFactorEnabled: false,
        managerId: manager.id,
        roles: {
          create: [{ role: { connect: { id: employeeRole.id } } }]
        }
      }
    });
    employeeId = employee.id;

    const otherEmployee = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-leave-other-${suffix}@example.test`,
        employeeId: `E2ELO-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Other',
        status: 'active',
        twoFactorEnabled: false,
        roles: {
          create: [{ role: { connect: { id: employeeRole.id } } }]
        }
      }
    });
    otherEmployeeId = otherEmployee.id;

    const hr = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-leave-hr-${suffix}@example.test`,
        employeeId: `E2ELH-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'HR',
        status: 'active',
        twoFactorEnabled: false,
        roles: {
          create: [{ role: { connect: { id: hrRole.id } } }]
        }
      }
    });

    const orgAdmin = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-leave-admin-${suffix}@example.test`,
        employeeId: `E2ELA-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Admin',
        status: 'active',
        twoFactorEnabled: false,
        roles: {
          create: [{ role: { connect: { id: orgAdminRole.id } } }]
        }
      }
    });
    orgAdminId = orgAdmin.id;

    userIds.push(manager.id, employee.id, otherEmployee.id, hr.id, orgAdmin.id);

    employeeCookie = await login(employee.email);
    managerCookie = await login(manager.email);
    hrCookie = await login(hr.email);
    otherEmployeeCookie = await login(otherEmployee.email);
    orgAdminCookie = await login(orgAdmin.email);
  });

  afterAll(async () => {
    try {
      await prisma.leaveRequest.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.leaveBalance.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.leaveType.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.userRole.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }]
        }
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await prisma.permission.deleteMany({ where: { id: { in: permissionIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('creates a leave type and seeds balances for every organization user', async () => {
    const res = await request(app)
      .post('/api/v2/leave-type')
      .set('Cookie', hrCookie)
      .send({
        orgId: organizationId,
        name: `Annual Leave ${Date.now()}`,
        description: 'Annual paid leave',
        annualLimit: 10,
        requiresApproval: true,
        isPaid: true,
        carryForward: false,
        maxCarryForward: 0
      });

    expect(res.status).toBe(201);
    annualLeaveTypeId = res.body.id;

    const balances = await prisma.leaveBalance.findMany({
      where: { leaveTypeId: annualLeaveTypeId }
    });

    expect(balances).toHaveLength(userIds.length);
    expect(balances.every((balance) => balance.remainingDays === 10)).toBe(true);
  });

  it('allows employees to list leave types and view their own balance', async () => {
    const typesRes = await request(app)
      .get(`/api/v2/leave-type/org/${organizationId}`)
      .set('Cookie', employeeCookie);

    expect(typesRes.status).toBe(200);
    expect(typesRes.body.some((type: { id: string }) => type.id === annualLeaveTypeId)).toBe(true);

    const balanceRes = await request(app)
      .get(`/api/v2/leave-balance/user/${employeeId}`)
      .set('Cookie', employeeCookie);

    expect(balanceRes.status).toBe(200);
    const balance = balanceRes.body.find(
      (item: { leaveTypeId: string }) => item.leaveTypeId === annualLeaveTypeId
    );
    expect(balance.remainingDays).toBe(10);
    expect(balance.usedDays).toBe(0);
  });

  it('denies unrelated employees access to another user leave and balances', async () => {
    const requestsRes = await request(app)
      .get(`/api/v2/leave-request/user/${employeeId}`)
      .set('Cookie', otherEmployeeCookie);

    expect(requestsRes.status).toBe(403);
    expect(requestsRes.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    const balanceRes = await request(app)
      .get(`/api/v2/leave-balance/user/${employeeId}`)
      .set('Cookie', otherEmployeeCookie);

    expect(balanceRes.status).toBe(403);
    expect(balanceRes.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('creates a pending leave request without deducting balance', async () => {
    const res = await request(app)
      .post('/api/v2/leave-request')
      .set('Cookie', employeeCookie)
      .send({
        userId: employeeId,
        leaveTypeId: annualLeaveTypeId,
        startDate: dateKey(30),
        endDate: dateKey(31),
        reason: 'Family event'
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.numberOfDays).toBe(2);
    approvedRequestId = res.body.id;

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        userId_leaveTypeId_year: {
          userId: employeeId,
          leaveTypeId: annualLeaveTypeId,
          year: new Date().getUTCFullYear()
        }
      }
    });
    expect(balance?.usedDays).toBe(0);
    expect(balance?.remainingDays).toBe(10);
  });

  it('rejects overlapping leave requests', async () => {
    const res = await request(app)
      .post('/api/v2/leave-request')
      .set('Cookie', employeeCookie)
      .send({
        userId: employeeId,
        leaveTypeId: annualLeaveTypeId,
        startDate: dateKey(31),
        endDate: dateKey(32),
        reason: 'Overlapping request'
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LEAVE_REQUEST_OVERLAP');
  });

  it('denies employees creating leave requests for other users', async () => {
    const res = await request(app)
      .post('/api/v2/leave-request')
      .set('Cookie', employeeCookie)
      .send({
        userId: otherEmployeeId,
        leaveTypeId: annualLeaveTypeId,
        startDate: dateKey(50),
        endDate: dateKey(50),
        reason: 'Request for someone else'
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('denies self-approval without approve_leave', async () => {
    const res = await request(app)
      .post(`/api/v2/leave-request/approve/${approvedRequestId}`)
      .set('Cookie', employeeCookie)
      .send({ approvedBy: employeeId });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('allows a direct manager to approve and deducts the balance', async () => {
    const res = await request(app)
      .post(`/api/v2/leave-request/approve/${approvedRequestId}`)
      .set('Cookie', managerCookie)
      .send({ approvedBy: managerId });

    expect(res.status).toBe(200);
    expect(res.body.leaveRequest.status).toBe('APPROVED');
    expect(res.body.leaveBalance.usedDays).toBe(2);
    expect(res.body.leaveBalance.remainingDays).toBe(8);
  });

  it('allows a direct manager to reject without deducting balance', async () => {
    const createRes = await request(app)
      .post('/api/v2/leave-request')
      .set('Cookie', employeeCookie)
      .send({
        userId: employeeId,
        leaveTypeId: annualLeaveTypeId,
        startDate: dateKey(40),
        endDate: dateKey(40),
        reason: 'Appointment'
      });
    expect(createRes.status).toBe(201);

    const rejectRes = await request(app)
      .post(`/api/v2/leave-request/reject/${createRes.body.id}`)
      .set('Cookie', managerCookie)
      .send({ approvedBy: managerId, rejectedReason: 'Coverage unavailable' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.rejectedReason).toBe('Coverage unavailable');

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        userId_leaveTypeId_year: {
          userId: employeeId,
          leaveTypeId: annualLeaveTypeId,
          year: new Date().getUTCFullYear()
        }
      }
    });
    expect(balance?.usedDays).toBe(2);
    expect(balance?.remainingDays).toBe(8);
  });

  it('restores balance when an approved request is cancelled', async () => {
    const res = await request(app)
      .post(`/api/v2/leave-request/cancel/${approvedRequestId}`)
      .set('Cookie', employeeCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        userId_leaveTypeId_year: {
          userId: employeeId,
          leaveTypeId: annualLeaveTypeId,
          year: new Date().getUTCFullYear()
        }
      }
    });
    expect(balance?.usedDays).toBe(0);
    expect(balance?.remainingDays).toBe(10);
  });

  it('updates the annual limit and adjusts current-year balances', async () => {
    const res = await request(app)
      .patch(`/api/v2/leave-type/${annualLeaveTypeId}`)
      .set('Cookie', hrCookie)
      .send({ annualLimit: 15 });

    expect(res.status).toBe(200);
    expect(res.body.annualLimit).toBe(15);

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        userId_leaveTypeId_year: {
          userId: employeeId,
          leaveTypeId: annualLeaveTypeId,
          year: new Date().getUTCFullYear()
        }
      }
    });
    expect(balance?.remainingDays).toBe(15);
  });

  it('auto-approves an Org_Admin leave request and deducts the balance', async () => {
    const res = await request(app)
      .post('/api/v2/leave-request')
      .set('Cookie', orgAdminCookie)
      .send({
        userId: orgAdminId,
        leaveTypeId: annualLeaveTypeId,
        startDate: dateKey(60),
        endDate: dateKey(60),
        reason: 'Personal day'
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.approvedBy).toBe(orgAdminId);

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        userId_leaveTypeId_year: {
          userId: orgAdminId,
          leaveTypeId: annualLeaveTypeId,
          year: new Date().getUTCFullYear()
        }
      }
    });
    expect(balance?.usedDays).toBe(1);
    expect(balance?.remainingDays).toBe(14);
  });

  it('allows HR to view organization-wide leave requests', async () => {
    const res = await request(app)
      .get(`/api/v2/leave-request/org/${organizationId}`)
      .set('Cookie', hrCookie);

    expect(res.status).toBe(200);
    expect(res.body.some((item: { id: string }) => item.id === approvedRequestId)).toBe(true);
  });

  it('denies employees leave type management without permission', async () => {
    const res = await request(app)
      .post('/api/v2/leave-type')
      .set('Cookie', employeeCookie)
      .send({
        orgId: organizationId,
        name: `Unauthorized Leave ${Date.now()}`,
        annualLimit: 5
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('deletes a leave type with its associated balances', async () => {
    const createRes = await request(app)
      .post('/api/v2/leave-type')
      .set('Cookie', hrCookie)
      .send({
        orgId: organizationId,
        name: `Temporary Leave ${Date.now()}`,
        annualLimit: 3
      });
    expect(createRes.status).toBe(201);

    const deleteRes = await request(app)
      .delete(`/api/v2/leave-type/${createRes.body.id}`)
      .set('Cookie', hrCookie);

    expect(deleteRes.status).toBe(200);

    const storedType = await prisma.leaveType.findUnique({
      where: { id: createRes.body.id }
    });
    expect(storedType).toBeNull();

    const balances = await prisma.leaveBalance.findMany({
      where: { leaveTypeId: createRes.body.id }
    });
    expect(balances).toHaveLength(0);
  });
});

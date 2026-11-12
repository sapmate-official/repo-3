/**
 * Database-backed integration tests for employee update authorization.
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

describeE2E('employee authorization integration (database)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let superAdminId: string | undefined;
  let superAdminCookie: string | undefined;
  let employeeCookie: string | undefined;

  const orgIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const permissionIds: string[] = [];

  let employeeRoleId: string;
  let adminRoleId: string;
  let employeeId: string;
  let employeeEmployeeId: string;
  let otherUserId: string;
  let deleteTargetId: string;
  let deleteTargetEmployeeId: string;

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

    const organization = await prisma.organization.create({
      data: { name: `E2E Employee Org ${suffix}` }
    });
    orgIds.push(organization.id);

    const updatePersonalPermission = await prisma.permission.create({
      data: {
        name: `E2E Update Personal ${suffix}`,
        module: 'user',
        action: 'update',
        key: 'update_personal_info'
      }
    });
    permissionIds.push(updatePersonalPermission.id);

    const employeeRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E Employee ${suffix}`,
        description: 'Employee self-service role',
        permissions: {
          create: [{ permission: { connect: { id: updatePersonalPermission.id } } }]
        }
      }
    });
    const adminRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E Admin ${suffix}`,
        description: 'Role that must not be self-assignable'
      }
    });
    employeeRoleId = employeeRole.id;
    adminRoleId = adminRole.id;
    roleIds.push(employeeRole.id, adminRole.id);

    const employee = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-employee-${suffix}@example.test`,
        employeeId: `E2EEMP-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Employee',
        jobTitle: 'Engineer',
        annualPackage: 100000,
        status: 'active',
        twoFactorEnabled: false,
        roles: {
          create: [{ role: { connect: { id: employeeRole.id } } }]
        }
      }
    });
    const otherUser = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-other-${suffix}@example.test`,
        employeeId: `E2EOTH-${suffix}`,
        hashedPassword,
        firstName: 'Other',
        lastName: 'Employee',
        status: 'active',
        twoFactorEnabled: false
      }
    });
    const deleteTarget = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-delete-${suffix}@example.test`,
        employeeId: `E2EDEL-${suffix}`,
        hashedPassword,
        firstName: 'Delete',
        lastName: 'Target',
        status: 'active',
        twoFactorEnabled: false
      }
    });

    employeeId = employee.id;
    employeeEmployeeId = employee.employeeId;
    otherUserId = otherUser.id;
    deleteTargetId = deleteTarget.id;
    deleteTargetEmployeeId = deleteTarget.employeeId;
    userIds.push(employee.id, otherUser.id, deleteTarget.id);

    superAdminCookie = await login(superAdmin.email);
    employeeCookie = await login(employee.email, organization.id);
  });

  afterAll(async () => {
    try {
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

      if (superAdminId) {
        await prisma.superAdminAuthSession.deleteMany({ where: { superAdminId } });
        await prisma.superAdmin.deleteMany({ where: { id: superAdminId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('lets an employee update only permitted personal fields on their own record', async () => {
    const res = await request(app)
      .put(`/api/v2/user/${employeeId}`)
      .set('Cookie', employeeCookie!)
      .send({
        firstName: 'Self Updated',
        jobTitle: 'Principal Engineer',
        annualPackage: 500000,
        status: 'inactive'
      });

    expect(res.status).toBe(200);

    const stored = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        firstName: true,
        jobTitle: true,
        annualPackage: true,
        status: true
      }
    });

    expect(stored).toMatchObject({
      firstName: 'Self Updated',
      jobTitle: 'Engineer',
      annualPackage: 100000,
      status: 'active'
    });
  });

  it('blocks self-assignment of privileged roles', async () => {
    const res = await request(app)
      .put(`/api/v2/user/${employeeId}`)
      .set('Cookie', employeeCookie!)
      .send({ roleIds: [adminRoleId] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    const assignments = await prisma.userRole.findMany({
      where: { userId: employeeId }
    });
    expect(assignments.map((assignment) => assignment.roleId)).toEqual([employeeRoleId]);
  });

  it('blocks employees from updating another employee', async () => {
    const res = await request(app)
      .put(`/api/v2/user/${otherUserId}`)
      .set('Cookie', employeeCookie!)
      .send({ firstName: 'Unauthorized' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('lets a super-admin update an employee by employee id without an org parameter', async () => {
    const res = await request(app)
      .put(`/api/v2/user/${employeeEmployeeId}`)
      .set('Cookie', superAdminCookie!)
      .send({ jobTitle: 'Promoted by super-admin' });

    expect(res.status).toBe(200);

    const stored = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { jobTitle: true }
    });
    expect(stored?.jobTitle).toBe('Promoted by super-admin');
  });

  it('lets a super-admin deactivate an employee by employee id without an org parameter', async () => {
    const res = await request(app)
      .delete(`/api/v2/user/${deleteTargetEmployeeId}`)
      .set('Cookie', superAdminCookie!);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deactivated: true });

    const stored = await prisma.user.findUnique({
      where: { id: deleteTargetId },
      select: { status: true }
    });
    expect(stored?.status).toBe('inactive');
  });
});

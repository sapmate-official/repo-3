/**
 * Database-backed integration tests for department permission mapping.
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

describeE2E('department authorization integration (database)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let deptManagerCookie: string | undefined;
  let hrCookie: string | undefined;

  const orgIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const permissionIds: string[] = [];

  let departmentId: string;
  let hrDepartmentId: string;
  let headUserId: string;
  let managedDepartmentId: string;

  const login = async (email: string, orgId: string): Promise<string> => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password, orgId });
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

    const organization = await prisma.organization.create({
      data: { name: `E2E Department Org ${suffix}` }
    });
    orgIds.push(organization.id);

    const permissionKeys = [
      'edit_department',
      'create_new_department',
      'delete_department',
      'change_department_head'
    ];
    const permissions = await Promise.all(
      permissionKeys.map((key) =>
        prisma.permission.create({
          data: {
            name: `E2E ${key} ${suffix}`,
            module: 'Department',
            action: key.split('_')[0]!,
            key
          }
        })
      )
    );
    permissionIds.push(...permissions.map((permission) => permission.id));

    const editPermission = permissions.find((permission) => permission.key === 'edit_department')!;

    const hrRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E HR ${suffix}`,
        description: 'HR role with edit-only department access',
        permissions: {
          create: [{ permission: { connect: { id: editPermission.id } } }]
        }
      }
    });
    const departmentManagerRole = await prisma.role.create({
      data: {
        orgId: organization.id,
        name: `E2E Department Manager ${suffix}`,
        description: 'Role with all department mutation permissions',
        permissions: {
          create: permissions.map((permission) => ({
            permission: { connect: { id: permission.id } }
          }))
        }
      }
    });
    roleIds.push(hrRole.id, departmentManagerRole.id);

    const hrUser = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-hr-${suffix}@example.test`,
        employeeId: `E2EHR-${suffix}`,
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
    const departmentManager = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-dept-manager-${suffix}@example.test`,
        employeeId: `E2EDM-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Department Manager',
        status: 'active',
        twoFactorEnabled: false,
        roles: {
          create: [{ role: { connect: { id: departmentManagerRole.id } } }]
        }
      }
    });
    const headUser = await prisma.user.create({
      data: {
        orgId: organization.id,
        email: `e2e-head-${suffix}@example.test`,
        employeeId: `E2EHEAD-${suffix}`,
        hashedPassword,
        firstName: 'E2E',
        lastName: 'Head',
        status: 'active',
        twoFactorEnabled: false
      }
    });

    userIds.push(hrUser.id, departmentManager.id, headUser.id);
    headUserId = headUser.id;

    const hrDepartment = await prisma.department.create({
      data: {
        orgId: organization.id,
        name: `E2E HR Department ${suffix}`,
        code: `E2EHR-${suffix}`
      }
    });
    departmentId = hrDepartment.id;
    hrDepartmentId = hrDepartment.id;

    deptManagerCookie = await login(departmentManager.email, organization.id);
    hrCookie = await login(hrUser.email, organization.id);
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
      await prisma.department.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await prisma.permission.deleteMany({ where: { id: { in: permissionIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('allows a role with all department keys to create, update, set head, and delete', async () => {
    const createRes = await request(app)
      .post('/api/v2/department')
      .set('Cookie', deptManagerCookie!)
      .send({ name: 'Managed Department', code: 'MANAGED' });

    expect(createRes.status).toBe(201);
    managedDepartmentId = createRes.body.id;

    const updateRes = await request(app)
      .patch(`/api/v2/department/${managedDepartmentId}`)
      .set('Cookie', deptManagerCookie!)
      .send({ description: 'Managed by department manager' });

    expect(updateRes.status).toBe(200);

    const headRes = await request(app)
      .put(`/api/v2/department/${managedDepartmentId}/head/${headUserId}`)
      .set('Cookie', deptManagerCookie!);

    expect(headRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/v2/department/${managedDepartmentId}`)
      .set('Cookie', deptManagerCookie!);

    expect(deleteRes.status).toBe(200);

    const stored = await prisma.department.findUnique({
      where: { id: managedDepartmentId }
    });
    expect(stored).toBeNull();
  });

  it('allows an HR role with edit_department to update a department', async () => {
    const res = await request(app)
      .patch(`/api/v2/department/${departmentId}`)
      .set('Cookie', hrCookie!)
      .send({ description: 'Updated by HR' });

    expect(res.status).toBe(200);

    const stored = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { description: true }
    });
    expect(stored?.description).toBe('Updated by HR');
  });

  it('denies HR department creation without create_new_department', async () => {
    const res = await request(app)
      .post('/api/v2/department')
      .set('Cookie', hrCookie!)
      .send({ name: 'Unauthorized Department' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    const stored = await prisma.department.findFirst({
      where: { orgId: { in: orgIds }, name: 'Unauthorized Department' }
    });
    expect(stored).toBeNull();
  });

  it('denies HR department deletion without delete_department', async () => {
    const res = await request(app)
      .delete(`/api/v2/department/${hrDepartmentId}`)
      .set('Cookie', hrCookie!);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    const stored = await prisma.department.findUnique({
      where: { id: hrDepartmentId }
    });
    expect(stored).not.toBeNull();
  });

  it('denies HR department head changes without change_department_head', async () => {
    const res = await request(app)
      .put(`/api/v2/department/${hrDepartmentId}/head/${headUserId}`)
      .set('Cookie', hrCookie!);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    const stored = await prisma.department.findUnique({
      where: { id: hrDepartmentId },
      select: { headId: true }
    });
    expect(stored?.headId).toBeNull();
  });
});

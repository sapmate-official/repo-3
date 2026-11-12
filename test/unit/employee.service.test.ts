import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  role: {
    findMany: vi.fn()
  },
  department: {
    findFirst: vi.fn()
  },
  organization_admin: {
    deleteMany: vi.fn()
  },
  authSession: {
    deleteMany: vi.fn()
  },
  emailOtpVerification: {
    deleteMany: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import prisma from '../../src/db/prisma.js';
import { EmployeeService } from '../../src/modules/employee/employee.service.js';
import { EmailService } from '../../src/services/email.service.js';

const employee = {
  id: 'user-1',
  orgId: 'org-a',
  employeeId: 'EMP001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  personalEmail: 'ada@example.test',
  businessEmail: null,
  hashedPassword: 'hash',
  refreshToken: null,
  roles: []
};

describe('EmployeeService', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findFirst).mockReset();
    vi.mocked(prisma.role.findMany).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
  });

  it('rejects employee creation when any requested role is outside the organization', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ id: 'role-a' }] as never);

    await expect(
      EmployeeService.createEmployee('org-a', {
        firstName: 'Ada',
        email: 'ada@example.test',
        employeeId: 'EMP001',
        roleIds: ['role-a', 'role-from-org-b']
      })
    ).rejects.toMatchObject({ code: 'INVALID_ROLE' });
  });

  it('creates employee and dispatches welcome email with credentials', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ id: 'role-a' }] as never);

    const emailSpy = vi.spyOn(EmailService, 'sendNewEmployeeWelcomeEmail').mockResolvedValue(undefined);

    const createdUser = {
      ...employee,
      organization: { name: 'Acme Corp' }
    };

    const tx = {
      user: { create: vi.fn().mockResolvedValue(createdUser) },
      leaveType: { findMany: vi.fn().mockResolvedValue([]) },
      leaveBalance: { createMany: vi.fn().mockResolvedValue({ count: 0 }) }
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return await (callback as (client: unknown) => Promise<unknown>)(tx);
      }
      return callback;
    });

    const result = await EmployeeService.createEmployee('org-a', {
      firstName: 'Ada',
      email: 'ada@example.test',
      employeeId: 'EMP001',
      roleIds: ['role-a']
    });

    expect(result.employeeId).toBe('EMP001');
    expect(result.temporaryPassword).toBeDefined();
    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ada@example.test',
        name: 'Ada Lovelace',
        employeeId: 'EMP001',
        companyName: 'Acme Corp'
      })
    );
  });

  it('rejects employee updates when any requested role is outside the organization', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(employee as never);
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ id: 'role-a' }] as never);

    await expect(
      EmployeeService.updateEmployee('org-a', 'user-1', {
        roleIds: ['role-a', 'role-from-org-b']
      })
    ).rejects.toMatchObject({ code: 'INVALID_ROLE' });
  });

  it('resolves the organization for a super-admin employee lookup', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ orgId: 'org-a' } as never);

    await expect(EmployeeService.getEmployeeOrgId('EMP001')).resolves.toBe('org-a');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'EMP001' }, { employeeId: 'EMP001' }]
      },
      select: { orgId: true }
    });
  });

  it('returns null when no employee matches a super-admin lookup', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await expect(EmployeeService.getEmployeeOrgId('missing')).resolves.toBeNull();
  });

  it('deactivates employees instead of hard deleting historical records', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(employee as never);

    const tx = {
      organization_admin: { deleteMany: vi.fn() },
      authSession: { deleteMany: vi.fn() },
      emailOtpVerification: { deleteMany: vi.fn() },
      user: { updateMany: vi.fn(), update: vi.fn() }
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return await (callback as (client: unknown) => Promise<unknown>)(tx);
      }
      return callback;
    });

    const result = await EmployeeService.deleteEmployee('org-a', 'user-1');

    expect(result).toMatchObject({
      employeeId: 'EMP001',
      deactivated: true
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        status: 'inactive',
        terminationDate: expect.any(Date),
        refreshToken: null
      }
    });
  });
});

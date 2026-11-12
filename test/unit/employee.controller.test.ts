import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const employeeServiceMock = vi.hoisted(() => ({
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  getEmployeeOrgId: vi.fn()
}));

vi.mock('../../src/modules/employee/employee.service.js', () => ({
  EmployeeService: employeeServiceMock
}));

import { EmployeeController } from '../../src/modules/employee/employee.controller.js';

const createResponse = () => {
  const json = vi.fn();
  const res = {
    status: vi.fn().mockReturnThis(),
    json
  } as unknown as Response;
  return { json, res };
};

const invokeUpdate = async (
  req: Partial<Request>,
  expectedError?: string
): Promise<{ json: ReturnType<typeof vi.fn>; next: NextFunction }> => {
  const { json, res } = createResponse();
  const next = vi.fn() as unknown as NextFunction;

  await EmployeeController.update(req as Request, res, next);

  if (expectedError) {
    expect(next).toHaveBeenCalledOnce();
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      code: expectedError
    });
  } else {
    expect(next).not.toHaveBeenCalled();
  }

  return { json, next };
};

describe('EmployeeController.update', () => {
  beforeEach(() => {
    vi.mocked(employeeServiceMock.updateEmployee).mockReset();
    vi.mocked(employeeServiceMock.deleteEmployee).mockReset();
    vi.mocked(employeeServiceMock.getEmployeeOrgId).mockReset();
  });

  it('lets an employee update only permitted personal fields on their own record', async () => {
    employeeServiceMock.updateEmployee.mockResolvedValue({ id: 'user-1' });

    await invokeUpdate({
      params: { id: 'user-1' },
      query: {},
      headers: {},
      body: {
        firstName: 'Ada',
        annualPackage: 200000,
        status: 'inactive'
      },
      user: {
        id: 'user-1',
        employeeId: 'EMP001',
        email: 'ada@example.test',
        orgId: 'org-a',
        roles: ['Employee'],
        permissions: ['update_personal_info'],
        isSuperAdmin: false
      }
    });

    expect(employeeServiceMock.updateEmployee).toHaveBeenCalledWith('org-a', 'user-1', {
      firstName: 'Ada'
    });
  });

  it('recognizes self-service updates addressed by employee id', async () => {
    employeeServiceMock.updateEmployee.mockResolvedValue({ id: 'user-1' });

    await invokeUpdate({
      params: { id: 'EMP001' },
      query: {},
      headers: {},
      body: { address: 'New address' },
      user: {
        id: 'user-1',
        employeeId: 'EMP001',
        email: 'ada@example.test',
        orgId: 'org-a',
        roles: ['Employee'],
        permissions: ['update_personal_info'],
        isSuperAdmin: false
      }
    });

    expect(employeeServiceMock.updateEmployee).toHaveBeenCalledWith('org-a', 'EMP001', {
      address: 'New address'
    });
  });

  it('blocks self-service role escalation without manage_role', async () => {
    await invokeUpdate(
      {
        params: { id: 'user-1' },
        query: {},
        headers: {},
        body: { roleIds: ['admin-role'] },
        user: {
          id: 'user-1',
          employeeId: 'EMP001',
          email: 'ada@example.test',
          orgId: 'org-a',
          roles: ['Employee'],
          permissions: ['update_personal_info'],
          isSuperAdmin: false
        }
      },
      'INSUFFICIENT_PERMISSIONS'
    );

    expect(employeeServiceMock.updateEmployee).not.toHaveBeenCalled();
  });

  it('resolves the organization when a super-admin updates by employee id', async () => {
    employeeServiceMock.getEmployeeOrgId.mockResolvedValue('org-b');
    employeeServiceMock.updateEmployee.mockResolvedValue({ id: 'user-2' });

    await invokeUpdate({
      params: { id: 'EMP002' },
      query: {},
      headers: {},
      body: { firstName: 'Grace' },
      user: {
        id: 'super-1',
        email: 'super@example.test',
        orgId: 'platform-superadmin',
        roles: ['SUPER_ADMIN'],
        permissions: ['*'],
        isSuperAdmin: true
      }
    });

    expect(employeeServiceMock.getEmployeeOrgId).toHaveBeenCalledWith('EMP002');
    expect(employeeServiceMock.updateEmployee).toHaveBeenCalledWith('org-b', 'EMP002', {
      firstName: 'Grace'
    });
  });
});

describe('EmployeeController.delete', () => {
  beforeEach(() => {
    vi.mocked(employeeServiceMock.deleteEmployee).mockReset();
    vi.mocked(employeeServiceMock.getEmployeeOrgId).mockReset();
  });

  it('resolves the organization when a super-admin deletes by employee id', async () => {
    employeeServiceMock.getEmployeeOrgId.mockResolvedValue('org-b');
    employeeServiceMock.deleteEmployee.mockResolvedValue({ deactivated: true });

    const { json, res } = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    await EmployeeController.delete(
      {
        params: { id: 'EMP002' },
        query: {},
        headers: {},
        user: {
          id: 'super-1',
          email: 'super@example.test',
          orgId: 'platform-superadmin',
          roles: ['SUPER_ADMIN'],
          permissions: ['*'],
          isSuperAdmin: true
        }
      } as unknown as Request,
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(employeeServiceMock.getEmployeeOrgId).toHaveBeenCalledWith('EMP002');
    expect(employeeServiceMock.deleteEmployee).toHaveBeenCalledWith('org-b', 'EMP002');
    expect(json).toHaveBeenCalledWith({ deactivated: true });
  });
});

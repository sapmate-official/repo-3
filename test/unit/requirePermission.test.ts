import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  requirePermission,
  requireRole,
  requireSelfOrPermission
} from '../../src/middleware/requirePermission.js';

const invoke = (
  middleware:
    | ReturnType<typeof requirePermission>
    | ReturnType<typeof requireRole>
    | ReturnType<typeof requireSelfOrPermission>,
  user?: unknown,
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) => {
  const req = { user, params, query } as unknown as Request;
  const json = vi.fn();
  const res = {
    status: vi.fn().mockReturnThis(),
    json
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  middleware(req, res, next);

  return { json, next, status: (res.status as unknown as ReturnType<typeof vi.fn>) };
};

describe('requirePermission', () => {
  it('rejects unauthenticated requests', () => {
    const { next, status } = invoke(requirePermission('view_salary'));
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows super-admins regardless of roles or permissions', () => {
    const { next } = invoke(requirePermission('view_salary'), {
      roles: ['SUPER_ADMIN'],
      permissions: [],
      isSuperAdmin: true
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows the default Org_Admin role', () => {
    const { next } = invoke(requirePermission('view_salary'), {
      roles: ['Org_Admin'],
      permissions: []
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a user with the required permission', () => {
    const { next } = invoke(requirePermission('view_salary'), {
      roles: ['Employee'],
      permissions: ['view_salary']
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a user without the required permission', () => {
    const { next, status } = invoke(requirePermission('view_salary'), {
      roles: ['Employee'],
      permissions: ['view_self']
    });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('supports custom allowed roles', () => {
    const { next } = invoke(requirePermission('view_salary', ['Payroll_Admin']), {
      roles: ['Payroll_Admin'],
      permissions: []
    });
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireSelfOrPermission', () => {
  it('allows a user to access their own resource', () => {
    const { next } = invoke(requireSelfOrPermission('user_read'), {
      id: 'user-1',
      roles: ['Employee'],
      permissions: []
    }, { id: 'user-1' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a user to access their own resource by employee id', () => {
    const { next } = invoke(requireSelfOrPermission('user_read'), {
      id: 'user-1',
      employeeId: 'EMP001',
      roles: ['Employee'],
      permissions: []
    }, { id: 'EMP001' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a user to access their own resource through the query string', () => {
    const { next } = invoke(requireSelfOrPermission('user_read'), {
      id: 'user-1',
      employeeId: 'EMP001',
      roles: ['Employee'],
      permissions: []
    }, {}, { id: 'user-1' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a user with the required permission', () => {
    const { next } = invoke(requireSelfOrPermission('user_read'), {
      id: 'user-1',
      roles: ['HR Manager'],
      permissions: ['user_read']
    }, { id: 'user-2' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects access to another user without permission', () => {
    const { next, status } = invoke(requireSelfOrPermission('user_read'), {
      id: 'user-1',
      roles: ['Employee'],
      permissions: ['view_personal_info_to_myself']
    }, { id: 'user-2' });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', () => {
    const { next, status } = invoke(requireSelfOrPermission('user_read'));
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('allows a matching role', () => {
    const { next } = invoke(requireRole(['Manager']), { roles: ['Manager'] });
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a non-matching role', () => {
    const { next, status } = invoke(requireRole(['Manager']), { roles: ['Employee'] });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', () => {
    const { next, status } = invoke(requireRole(['Manager']));
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requirePermission, requireRole } from '../../src/middleware/requirePermission.js';

const invoke = (
  middleware: ReturnType<typeof requirePermission> | ReturnType<typeof requireRole>,
  user?: unknown
) => {
  const req = { user } as unknown as Request;
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

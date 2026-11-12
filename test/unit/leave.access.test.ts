import { describe, expect, it } from 'vitest';
import {
  canActOnUserLeave,
  canManageLeaveBalance,
  canViewAllLeave,
  canViewSubordinateLeave,
  canViewUserBalance,
  canViewUserLeave
} from '../../src/modules/leave/leave.access.js';

describe('canViewAllLeave', () => {
  it('allows super admins', () => {
    expect(canViewAllLeave({ id: 'super', isSuperAdmin: true })).toBe(true);
  });

  it('allows the view-all leave permission', () => {
    expect(
      canViewAllLeave({ id: 'hr', permissions: ['view_all_user_leave'] })
    ).toBe(true);
  });

  it('allows Org_Admin', () => {
    expect(canViewAllLeave({ id: 'admin', roles: ['Org_Admin'] })).toBe(true);
  });

  it('denies regular employees', () => {
    expect(
      canViewAllLeave({ id: 'employee', roles: ['Employee'], permissions: ['leave_request'] })
    ).toBe(false);
  });
});

describe('canViewSubordinateLeave', () => {
  it('allows a manager with the subordinate leave permission', () => {
    expect(
      canViewSubordinateLeave(
        { id: 'manager', permissions: ['view_subordinates_leave'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(true);
  });

  it('allows an approver to view direct reports', () => {
    expect(
      canViewSubordinateLeave(
        { id: 'manager', permissions: ['approve_leave'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(true);
  });

  it('denies managers without a leave permission', () => {
    expect(
      canViewSubordinateLeave(
        { id: 'manager', permissions: ['view_personal_info_of_subordinates'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(false);
  });

  it('denies indirect reports', () => {
    expect(
      canViewSubordinateLeave(
        { id: 'manager', permissions: ['view_subordinates_leave'] },
        { id: 'employee', managerId: 'other-manager' }
      )
    ).toBe(false);
  });
});

describe('canViewUserLeave', () => {
  it('allows an employee to view their own leave', () => {
    expect(canViewUserLeave({ id: 'employee' }, { id: 'employee' })).toBe(true);
  });

  it('allows a manager to view a direct report', () => {
    expect(
      canViewUserLeave(
        { id: 'manager', permissions: ['view_subordinates_leave'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(true);
  });

  it('allows organization-wide viewers to view any user', () => {
    expect(
      canViewUserLeave(
        { id: 'hr', permissions: ['view_all_user_leave'] },
        { id: 'employee', managerId: 'other-manager' }
      )
    ).toBe(true);
  });

  it('denies unrelated employees', () => {
    expect(
      canViewUserLeave(
        { id: 'other', roles: ['Employee'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(false);
  });
});

describe('canActOnUserLeave', () => {
  it('allows a direct manager to act on a report request', () => {
    expect(
      canActOnUserLeave({ id: 'manager' }, { id: 'employee', managerId: 'manager' })
    ).toBe(true);
  });

  it('allows organization-wide viewers to act on any request', () => {
    expect(
      canActOnUserLeave(
        { id: 'hr', permissions: ['view_all_user_leave'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(true);
  });

  it('denies unrelated employees', () => {
    expect(
      canActOnUserLeave({ id: 'other' }, { id: 'employee', managerId: 'manager' })
    ).toBe(false);
  });
});

describe('canViewUserBalance', () => {
  it('allows employees to view their own balance', () => {
    expect(canViewUserBalance({ id: 'employee' }, { id: 'employee' })).toBe(true);
  });

  it('allows a manager to view a direct report balance', () => {
    expect(
      canViewUserBalance(
        { id: 'manager', permissions: ['view_subordinates_leave'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(true);
  });

  it('denies unrelated employees', () => {
    expect(
      canViewUserBalance(
        { id: 'other', roles: ['Employee'] },
        { id: 'employee', managerId: 'manager' }
      )
    ).toBe(false);
  });
});

describe('canManageLeaveBalance', () => {
  it('allows the manage leave balance permission', () => {
    expect(
      canManageLeaveBalance({ id: 'hr', permissions: ['manage_leave_balance'] })
    ).toBe(true);
  });

  it('allows organization-wide leave viewers', () => {
    expect(
      canManageLeaveBalance({ id: 'hr', permissions: ['view_all_user_leave'] })
    ).toBe(true);
  });

  it('denies regular employees', () => {
    expect(
      canManageLeaveBalance({ id: 'employee', permissions: ['leave_request'] })
    ).toBe(false);
  });
});

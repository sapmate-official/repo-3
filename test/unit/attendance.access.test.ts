import { describe, expect, it } from 'vitest';
import {
  canViewAllAttendance,
  canViewUserAttendance,
  canVerifyUserAttendance
} from '../../src/modules/attendance/attendance.access.js';

describe('canViewAllAttendance', () => {
  it('allows super admins', () => {
    expect(canViewAllAttendance({ id: 'admin', isSuperAdmin: true })).toBe(true);
  });

  it('allows the view-all permission', () => {
    expect(
      canViewAllAttendance({ id: 'hr', permissions: ['view_all_user_attendance'] })
    ).toBe(true);
  });

  it('allows attendance admin roles', () => {
    expect(canViewAllAttendance({ id: 'hr', roles: ['HR Manager'] })).toBe(true);
    expect(canViewAllAttendance({ id: 'admin', roles: ['Org_Admin'] })).toBe(true);
  });

  it('denies regular employees', () => {
    expect(canViewAllAttendance({ id: 'employee', roles: ['Employee'] })).toBe(false);
  });
});

describe('canViewUserAttendance', () => {
  it('allows an employee to view their own attendance', () => {
    expect(canViewUserAttendance({ id: 'employee' }, { id: 'employee' })).toBe(true);
  });

  it('allows a manager to view a direct report', () => {
    expect(
      canViewUserAttendance({ id: 'manager' }, { id: 'employee', managerId: 'manager' })
    ).toBe(true);
  });

  it('denies a manager from viewing another manager report', () => {
    expect(
      canViewUserAttendance({ id: 'manager' }, { id: 'employee', managerId: 'other-manager' })
    ).toBe(false);
  });

  it('allows attendance admins to view any user', () => {
    expect(
      canViewUserAttendance(
        { id: 'admin', permissions: ['view_all_user_attendance'] },
        { id: 'employee', managerId: 'other-manager' }
      )
    ).toBe(true);
  });
});

describe('canVerifyUserAttendance', () => {
  it('allows a manager to verify a direct report', () => {
    expect(canVerifyUserAttendance({ id: 'manager' }, { managerId: 'manager' })).toBe(true);
  });

  it('denies unrelated employees', () => {
    expect(canVerifyUserAttendance({ id: 'employee' }, { managerId: 'manager' })).toBe(false);
  });
});

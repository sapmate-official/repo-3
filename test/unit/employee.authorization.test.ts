import { describe, expect, it } from 'vitest';
import {
  filterEmployeeUpdateInput,
  isSelfIdentifier,
  type EmployeeUpdateActor
} from '../../src/modules/employee/employee.authorization.js';

const actor = (
  permissions: string[],
  overrides: Partial<EmployeeUpdateActor> = {}
): EmployeeUpdateActor => ({
  id: 'user-1',
  employeeId: 'EMP001',
  roles: ['Employee'],
  permissions,
  isSuperAdmin: false,
  ...overrides
});

describe('employee update authorization', () => {
  it('recognizes self by user id or employee id', () => {
    const current = actor([]);
    expect(isSelfIdentifier(current, 'user-1')).toBe(true);
    expect(isSelfIdentifier(current, 'EMP001')).toBe(true);
    expect(isSelfIdentifier(current, 'user-2')).toBe(false);
  });

  it('allows self personal fields unconditionally (no permission required)', () => {
    // Personal fields are always allowed for self — no permission key needed
    const input = filterEmployeeUpdateInput(
      {
        firstName: 'Ada',
        address: 'New address',
        jobTitle: 'Principal Engineer',
        annualPackage: 200000,
        departmentId: 'dept-b',
        status: 'inactive'
      },
      actor([]),           // zero permissions
      true
    );

    // Employment, salary, status stripped — only personal fields pass through
    expect(input).toEqual({
      firstName: 'Ada',
      address: 'New address'
    });
  });

  it('allows self employment and salary fields WITH their own permissions (plus personal always)', () => {
    const input = filterEmployeeUpdateInput(
      {
        jobTitle: 'Principal Engineer',
        departmentId: 'dept-b',
        annualPackage: 200000,
        monthlySalary: 16666,
        firstName: 'Ada'   // personal — always through
      },
      actor(['update_employee_own', 'update_salary_own']),
      true
    );

    // All submitted fields are permitted
    expect(input).toEqual({
      firstName: 'Ada',
      jobTitle: 'Principal Engineer',
      departmentId: 'dept-b',
      annualPackage: 200000,
      monthlySalary: 16666
    });
  });

  it('rejects role changes without manage_role', () => {
    expect(() =>
      filterEmployeeUpdateInput(
        { roleIds: ['admin-role'] },
        actor(['update_personal_info']),
        true
      )
    ).toThrowError(/manage_role/);
  });

  it('rejects updates when no submitted field is permitted', () => {
    expect(() =>
      filterEmployeeUpdateInput(
        { annualPackage: 200000 },
        actor(['update_personal_info']),
        true
      )
    ).toThrowError(/No permitted fields/);
  });

  it('allows Org_Admin and super-admin actors to update every field', () => {
    const input = {
      firstName: 'Ada',
      roleIds: ['admin-role'],
      status: 'inactive' as const,
      terminationDate: '2026-01-01'
    };

    expect(
      filterEmployeeUpdateInput(input, actor([], { roles: ['Org_Admin'] }), false)
    ).toEqual(input);
    expect(
      filterEmployeeUpdateInput(input, actor([], { isSuperAdmin: true }), false)
    ).toEqual(input);
  });
});

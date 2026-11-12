import { PERMISSION_KEYS } from '../auth/permissionKeys.js';
import { AppError } from '../../util/errors.js';
import type { UpdateEmployeeInput } from './employee.service.js';

export interface EmployeeUpdateActor {
  id: string;
  employeeId?: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

const PERSONAL_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'personalEmail',
  'mobileNumber',
  'emergencyContact',
  'dateOfBirth',
  'address',
  'adharNumber',
  'panNumber'
] as const;

const EMPLOYMENT_SELF_FIELDS = [
  'businessEmail',
  'jobTitle',
  'hiredDate',
  'employeeId',
  'departmentId',
  'managerId'
] as const;

const SALARY_FIELDS = [
  'annualPackage',
  'monthlySalary',
  'hraPercentage',
  'daPercentage',
  'taPercentage',
  'pfPercentage',
  'taxPercentage',
  'insuranceFixed'
] as const;

const STATUS_FIELDS = ['status', 'terminationDate'] as const;

const ALL_UPDATE_FIELDS = [
  ...PERSONAL_FIELDS,
  ...EMPLOYMENT_SELF_FIELDS,
  ...SALARY_FIELDS,
  ...STATUS_FIELDS,
  'roleIds'
] as const;

type EmployeeUpdateField = (typeof ALL_UPDATE_FIELDS)[number];

export const isSelfIdentifier = (
  actor: EmployeeUpdateActor,
  identifier: string
): boolean =>
  identifier === actor.id ||
  (!!actor.employeeId && identifier === actor.employeeId);

const addFields = (
  target: Set<EmployeeUpdateField>,
  fields: readonly EmployeeUpdateField[]
): void => {
  for (const field of fields) {
    target.add(field);
  }
};

export const getAllowedUpdateFields = (
  actor: EmployeeUpdateActor,
  isSelf: boolean
): Set<EmployeeUpdateField> => {
  if (actor.isSuperAdmin || actor.roles.includes('Org_Admin')) {
    return new Set(ALL_UPDATE_FIELDS);
  }

  const allowed = new Set<EmployeeUpdateField>();

  if (!isSelf) {
    addFields(allowed, PERSONAL_FIELDS);
    addFields(allowed, EMPLOYMENT_SELF_FIELDS);
    addFields(allowed, SALARY_FIELDS);
    addFields(allowed, STATUS_FIELDS);
    if (actor.permissions.includes(PERMISSION_KEYS.roleManage)) {
      allowed.add('roleIds');
    }
    return allowed;
  }

  if (actor.permissions.includes(PERMISSION_KEYS.personalSelfUpdate)) {
    addFields(allowed, PERSONAL_FIELDS);
  }
  if (actor.permissions.includes(PERMISSION_KEYS.employeeSelfUpdate)) {
    addFields(allowed, EMPLOYMENT_SELF_FIELDS);
  }
  if (actor.permissions.includes(PERMISSION_KEYS.salarySelfUpdate)) {
    addFields(allowed, SALARY_FIELDS);
  }
  if (actor.permissions.includes(PERMISSION_KEYS.personalAllUpdate)) {
    addFields(allowed, STATUS_FIELDS);
  }
  if (actor.permissions.includes(PERMISSION_KEYS.roleManage)) {
    allowed.add('roleIds');
  }

  return allowed;
};

export const filterEmployeeUpdateInput = (
  input: UpdateEmployeeInput,
  actor: EmployeeUpdateActor,
  isSelf: boolean
): UpdateEmployeeInput => {
  const allowed = getAllowedUpdateFields(actor, isSelf);

  if (input.roleIds !== undefined && !allowed.has('roleIds')) {
    throw new AppError(
      `Access denied. Missing required permission: '${PERMISSION_KEYS.roleManage}'`,
      403,
      'INSUFFICIENT_PERMISSIONS'
    );
  }

  const filtered: UpdateEmployeeInput = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowed.has(key as EmployeeUpdateField)) {
      (filtered as Record<string, unknown>)[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    throw new AppError(
      'Access denied. No permitted fields were supplied for this update.',
      403,
      'INSUFFICIENT_PERMISSIONS'
    );
  }

  return filtered;
};

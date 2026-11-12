export interface AttendanceActor {
  id: string;
  orgId?: string;
  isSuperAdmin?: boolean;
  roles?: string[];
  permissions?: string[];
}

const VIEW_ALL_ROLES = new Set([
  'Org_Admin',
  'SuperAdmin',
  'SUPER_ADMIN',
  'CEO',
  'HR Director',
  'HR Manager',
  'HR Executive'
]);

const hasPermission = (actor: AttendanceActor, permission: string): boolean => {
  if (actor.isSuperAdmin) {
    return true;
  }
  const permissions = actor.permissions ?? [];
  return permissions.includes('*') || permissions.includes(permission);
};

export const canViewAllAttendance = (actor: AttendanceActor): boolean => {
  if (hasPermission(actor, 'view_all_user_attendance')) {
    return true;
  }
  return Boolean(actor.roles?.some((role) => VIEW_ALL_ROLES.has(role)));
};

export const canViewUserAttendance = (
  actor: AttendanceActor,
  target: { id: string; managerId?: string | null }
): boolean => {
  if (target.id === actor.id) {
    return true;
  }
  if (canViewAllAttendance(actor)) {
    return true;
  }
  return target.managerId === actor.id;
};

export const canVerifyUserAttendance = (
  actor: AttendanceActor,
  target: { managerId?: string | null }
): boolean => {
  return canViewAllAttendance(actor) || target.managerId === actor.id;
};

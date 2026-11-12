import { PERMISSION_KEYS } from '../auth/permissionKeys.js';

export interface LeaveActor {
  id: string;
  orgId?: string;
  isSuperAdmin?: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface LeaveTargetUser {
  id: string;
  managerId?: string | null;
}

const hasPermission = (actor: LeaveActor, permission: string): boolean => {
  if (actor.isSuperAdmin) {
    return true;
  }
  const permissions = actor.permissions ?? [];
  return permissions.includes('*') || permissions.includes(permission);
};

const isOrgAdmin = (actor: LeaveActor): boolean =>
  actor.isSuperAdmin === true || (actor.roles ?? []).includes('Org_Admin');

export const canViewAllLeave = (actor: LeaveActor): boolean =>
  isOrgAdmin(actor) || hasPermission(actor, PERMISSION_KEYS.leaveAllView);

export const canViewSubordinateLeave = (
  actor: LeaveActor,
  target: LeaveTargetUser
): boolean => {
  if (target.managerId !== actor.id) {
    return false;
  }

  return (
    hasPermission(actor, PERMISSION_KEYS.leaveSubordinatesView) ||
    hasPermission(actor, PERMISSION_KEYS.leaveApprove) ||
    hasPermission(actor, PERMISSION_KEYS.leaveReject)
  );
};

export const canViewUserLeave = (
  actor: LeaveActor,
  target: LeaveTargetUser
): boolean => {
  if (target.id === actor.id) {
    return true;
  }
  return canViewAllLeave(actor) || canViewSubordinateLeave(actor, target);
};

export const canActOnUserLeave = (
  actor: LeaveActor,
  target: LeaveTargetUser
): boolean => canViewAllLeave(actor) || target.managerId === actor.id;

export const canViewUserBalance = (
  actor: LeaveActor,
  target: LeaveTargetUser
): boolean => {
  if (target.id === actor.id) {
    return true;
  }
  return canViewAllLeave(actor) || canViewSubordinateLeave(actor, target);
};

export const canManageLeaveBalance = (actor: LeaveActor): boolean =>
  canViewAllLeave(actor) || hasPermission(actor, PERMISSION_KEYS.leaveBalanceManage);

export const isOrgAdminUser = isOrgAdmin;

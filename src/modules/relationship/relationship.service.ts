import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export interface UserPermissionItem {
  key: string | null;
  name: string;
  description?: string | null;
}

export interface UserRelationshipDetail {
  isDirectManager: boolean;
  isIndirectManager: boolean;
  isSelf: boolean;
  canViewProfile: boolean;
  canEditProfile: boolean;
  canViewSalary: boolean;
  canViewBankDetails: boolean;
  canViewPersonalInfo: boolean;
  canViewEmploymentInfo: boolean;
}

export interface TargetUserInfo {
  id: string;
  name: string;
  email: string;
  roles: string[];
  isOrgAdmin: boolean;
}

export interface UserRelationshipData {
  userId: string;
  userRoles: string[];
  isOrgAdmin: boolean;
  orgId: string;
  targetUser?: TargetUserInfo;
  relationship?: UserRelationshipDetail;
  isManager?: boolean;
}

export interface OrgAdminUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface OrganizationRoleInfo {
  isManager: boolean;
  isDepartmentHead: boolean;
  subordinateCount: number;
  departmentName: string | null;
  organizationAdmins: OrgAdminUserSummary[];
}

export interface OrganizationRelationshipData {
  userId: string;
  userRoles: string[];
  isOrgAdmin: boolean;
  orgId: string;
  organizationRole: OrganizationRoleInfo;
  permissions: UserPermissionItem[];
}

export class RelationshipService {
  /**
   * Recursively check whether managerId is an indirect manager of targetUserId up the hierarchy.
   * maxDepth guard prevents infinite recursion in cyclic data.
   */
  static async checkIndirectManagership(
    managerId: string,
    targetUserId: string,
    currentDepth = 0,
    maxDepth = 15
  ): Promise<boolean> {
    if (currentDepth >= maxDepth) return false;
    try {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { managerId: true }
      });

      if (!targetUser?.managerId) return false;
      if (targetUser.managerId === managerId) return true;

      return await this.checkIndirectManagership(
        managerId,
        targetUser.managerId,
        currentDepth + 1,
        maxDepth
      );
    } catch {
      return false;
    }
  }

  // --- Permission calculation helpers matching legacy business rules ---

  static canViewUserProfile(
    currentUserId: string,
    targetUserId: string,
    isDirectManager: boolean,
    isIndirectManager: boolean,
    isOrgAdmin: boolean
  ): boolean {
    if (currentUserId === targetUserId) return true;
    if (isOrgAdmin) return true;
    if (isDirectManager || isIndirectManager) return true;
    return false;
  }

  static canEditUserProfile(
    currentUserId: string,
    targetUserId: string,
    isDirectManager: boolean,
    isOrgAdmin: boolean
  ): boolean {
    if (currentUserId === targetUserId) return true;
    if (isOrgAdmin) return true;
    if (isDirectManager) return true;
    return false;
  }

  static canViewUserSalary(
    currentUserId: string,
    targetUserId: string,
    isDirectManager: boolean,
    isOrgAdmin: boolean
  ): boolean {
    if (currentUserId === targetUserId) return true;
    if (isOrgAdmin) return true;
    if (isDirectManager) return true;
    return false;
  }

  static canViewUserBankDetails(
    currentUserId: string,
    targetUserId: string,
    isDirectManager: boolean,
    isOrgAdmin: boolean,
    userPermissions: UserPermissionItem[]
  ): boolean {
    // Check if viewing own bank details with self permission
    if (currentUserId === targetUserId) {
      return userPermissions.some(
        (p) =>
          p.key === 'view_salary_slip_to_myself' ||
          p.key === 'generate_salary_to_myself' ||
          p.key === 'send_salary_to_myself' ||
          p.key === 'view_bank_own'
      );
    }

    // Org admin can always view
    if (isOrgAdmin) return true;

    // Direct manager can view subordinates' bank details
    if (isDirectManager) {
      return userPermissions.some(
        (p) =>
          p.key === 'view_salary_slip_of_subordinates' ||
          p.key === 'generate_salary_of_subordinates' ||
          p.key === 'send_salary_to_subordinates' ||
          p.key === 'view_bank_subordinates'
      );
    }

    // User with "all user" permissions can view anyone's bank details
    return userPermissions.some(
      (p) =>
        p.key === 'view_salary_slip_of_all' ||
        p.key === 'generate_salary_of_all' ||
        p.key === 'send_salary_to_all' ||
        p.key === 'view_bank_all_user'
    );
  }

  static canViewUserPersonalInfo(
    currentUserId: string,
    targetUserId: string,
    isDirectManager: boolean,
    isIndirectManager: boolean,
    isOrgAdmin: boolean
  ): boolean {
    if (currentUserId === targetUserId) return true;
    if (isOrgAdmin) return true;
    if (isDirectManager || isIndirectManager) return true;
    return false;
  }

  static canViewUserEmploymentInfo(
    currentUserId: string,
    targetUserId: string,
    isDirectManager: boolean,
    isIndirectManager: boolean,
    isOrgAdmin: boolean
  ): boolean {
    if (currentUserId === targetUserId) return true;
    if (isOrgAdmin) return true;
    if (isDirectManager || isIndirectManager) return true;
    return false;
  }

  /**
   * Get relationship between the current authenticated user and a target user.
   */
  static async getRelationshipWithUser(
    currentUserId: string,
    targetUserId: string
  ): Promise<UserRelationshipData> {
    const userWithRoles = await prisma.user.findUnique({
      where: { id: currentUserId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!userWithRoles) {
      throw new AppError('Current user not found', 404, 'USER_NOT_FOUND');
    }

    const orgAdminRecord = await prisma.organization_admin.findFirst({
      where: {
        adminId: currentUserId,
        orgId: userWithRoles.orgId
      }
    });
    const hasAdminRole = userWithRoles.roles.some((ur) => ur.role.name === 'Org_Admin');
    const isOrgAdmin = !!orgAdminRecord || hasAdminRole;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!targetUser) {
      throw new AppError('Target user not found', 404, 'TARGET_USER_NOT_FOUND');
    }

    if (targetUser.orgId !== userWithRoles.orgId) {
      throw new AppError('Users are not in the same organization', 403, 'TENANT_MISMATCH');
    }

    const isDirectManager = targetUser.managerId === currentUserId;
    const isIndirectManager = await this.checkIndirectManagership(currentUserId, targetUserId);

    const hasSubordinates = await prisma.user.findFirst({
      where: {
        managerId: currentUserId,
        orgId: userWithRoles.orgId
      }
    });

    const targetOrgAdminRecord = await prisma.organization_admin.findFirst({
      where: {
        adminId: targetUserId,
        orgId: userWithRoles.orgId
      }
    });
    const isTargetOrgAdmin =
      !!targetOrgAdminRecord || targetUser.roles.some((ur) => ur.role.name === 'Org_Admin');

    const userPermissions: UserPermissionItem[] = userWithRoles.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => ({
        key: rp.permission.key,
        name: rp.permission.name
      }))
    );

    return {
      userId: currentUserId,
      userRoles: userWithRoles.roles.map((ur) => ur.role.name),
      isOrgAdmin,
      orgId: userWithRoles.orgId,
      targetUser: {
        id: targetUser.id,
        name: `${targetUser.firstName ?? ''} ${targetUser.lastName ?? ''}`.trim(),
        email: targetUser.email,
        roles: targetUser.roles.map((ur) => ur.role.name),
        isOrgAdmin: isTargetOrgAdmin
      },
      relationship: {
        isDirectManager,
        isIndirectManager,
        isSelf: currentUserId === targetUserId,
        canViewProfile: this.canViewUserProfile(
          currentUserId,
          targetUserId,
          isDirectManager,
          isIndirectManager,
          isOrgAdmin
        ),
        canEditProfile: this.canEditUserProfile(
          currentUserId,
          targetUserId,
          isDirectManager,
          isOrgAdmin
        ),
        canViewSalary: this.canViewUserSalary(
          currentUserId,
          targetUserId,
          isDirectManager,
          isOrgAdmin
        ),
        canViewBankDetails: this.canViewUserBankDetails(
          currentUserId,
          targetUserId,
          isDirectManager,
          isOrgAdmin,
          userPermissions
        ),
        canViewPersonalInfo: this.canViewUserPersonalInfo(
          currentUserId,
          targetUserId,
          isDirectManager,
          isIndirectManager,
          isOrgAdmin
        ),
        canViewEmploymentInfo: this.canViewUserEmploymentInfo(
          currentUserId,
          targetUserId,
          isDirectManager,
          isIndirectManager,
          isOrgAdmin
        )
      },
      isManager: !!hasSubordinates
    };
  }

  /**
   * Get general organization relationship details for current authenticated user.
   */
  static async getOrganizationRelationship(
    currentUserId: string
  ): Promise<OrganizationRelationshipData> {
    const userWithRoles = await prisma.user.findUnique({
      where: { id: currentUserId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!userWithRoles) {
      throw new AppError('Current user not found', 404, 'USER_NOT_FOUND');
    }

    const orgId = userWithRoles.orgId;

    const orgAdminRecord = await prisma.organization_admin.findFirst({
      where: {
        adminId: currentUserId,
        orgId
      }
    });
    const hasAdminRole = userWithRoles.roles.some((ur) => ur.role.name === 'Org_Admin');
    const isOrgAdmin = !!orgAdminRecord || hasAdminRole;

    const hasSubordinates = await prisma.user.findFirst({
      where: {
        managerId: currentUserId,
        orgId
      }
    });

    const subordinateCount = await prisma.user.count({
      where: {
        managerId: currentUserId,
        orgId
      }
    });

    const departmentHead = await prisma.department.findFirst({
      where: {
        headId: currentUserId,
        orgId
      }
    });

    const allOrgAdmins = await prisma.organization_admin.findMany({
      where: { orgId },
      include: {
        admin_user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const permissions: UserPermissionItem[] = userWithRoles.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => ({
        key: rp.permission.key,
        name: rp.permission.name,
        description: rp.permission.description
      }))
    );

    return {
      userId: currentUserId,
      userRoles: userWithRoles.roles.map((ur) => ur.role.name),
      isOrgAdmin,
      orgId,
      organizationRole: {
        isManager: !!hasSubordinates,
        isDepartmentHead: !!departmentHead,
        subordinateCount,
        departmentName: departmentHead?.name ?? null,
        organizationAdmins: allOrgAdmins.map((admin) => ({
          id: admin.admin_user.id,
          name: `${admin.admin_user.firstName ?? ''} ${admin.admin_user.lastName ?? ''}`.trim(),
          email: admin.admin_user.email
        }))
      },
      permissions
    };
  }
}

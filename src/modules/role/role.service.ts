import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export interface CreateRoleInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  orgId?: string;
  permissions?: ({ permissionId?: string; id?: string } | string)[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  isDefault?: boolean;
  permissions?: ({ permissionId?: string; id?: string } | string)[];
}

export class RoleService {
  private static async ensureOrganization(orgId: string): Promise<void> {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true }
    });

    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
    }
  }

  /**
   * List all roles for an organization.
   * If the organization has no roles, seed standard defaults automatically.
   */
  static async listRoles(orgId: string) {
    if (!orgId) {
      throw new AppError('Organization ID is required', 400, 'ORG_ID_REQUIRED');
    }

    await this.ensureOrganization(orgId);

    let roles = await prisma.role.findMany({
      where: { orgId },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (roles.length === 0) {
      // Auto-seed default roles for this organization
      const defaultRoles = [
        { name: 'Org_Admin', description: 'Organization Administrator with full administrative access', isDefault: true },
        { name: 'HR Executive', description: 'Human Resources Executive with onboarding and workforce management', isDefault: false },
        { name: 'Manager', description: 'Department manager with team oversight and leave approvals', isDefault: false },
        { name: 'Senior Software Engineer', description: 'Senior technical contributor and tech lead', isDefault: false },
        { name: 'Software Engineer', description: 'Software engineering and technical contributor', isDefault: false },
        { name: 'Employee', description: 'Standard employee with self-service access', isDefault: false }
      ];

      for (const r of defaultRoles) {
        await prisma.role.upsert({
          where: { orgId_name: { orgId, name: r.name } },
          update: {},
          create: {
            orgId,
            name: r.name,
            description: r.description,
            isDefault: r.isDefault
          }
        });
      }

      roles = await prisma.role.findMany({
        where: { orgId },
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });
    }

    return roles;
  }

  /**
   * Get role by ID
   */
  static async getRoleById(orgId: string | undefined, id: string) {
    const role = await prisma.role.findFirst({
      where: { id, ...(orgId ? { orgId } : {}) },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });

    if (!role) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }

    return role;
  }

  /**
   * Create a new role
   */
  static async createRole(orgId: string, data: CreateRoleInput) {
    if (!orgId) {
      throw new AppError('Organization ID is required', 400, 'ORG_ID_REQUIRED');
    }
    if (!data.name) {
      throw new AppError('Role name is required', 400, 'ROLE_NAME_REQUIRED');
    }

    await this.ensureOrganization(orgId);

    const existing = await prisma.role.findFirst({
      where: { orgId, name: data.name }
    });

    if (existing) {
      throw new AppError('A role with this name already exists in the organization', 409, 'ROLE_EXISTS');
    }

    const permissionIds: string[] = (data.permissions ?? [])
      .map((p) => (typeof p === 'string' ? p : (p.permissionId ?? p.id ?? '')))
      .filter(Boolean);

    const role = await prisma.role.create({
      data: {
        orgId,
        name: data.name,
        description: data.description,
        isDefault: Boolean(data.isDefault),
        permissions: {
          create: permissionIds.map((pId) => ({
            permission: { connect: { id: pId } }
          }))
        }
      },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });

    return role;
  }

  /**
   * Update role
   */
  static async updateRole(orgId: string | undefined, roleId: string, data: UpdateRoleInput) {
    const existing = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { orgId } : {}) }
    });

    if (!existing) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }

    if (data.name && data.name !== existing.name) {
      const conflict = await prisma.role.findFirst({
        where: { orgId: existing.orgId, name: data.name, id: { not: roleId } }
      });
      if (conflict) {
        throw new AppError('A role with this name already exists', 409, 'ROLE_EXISTS');
      }
    }

    return await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: {
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
          isDefault: data.isDefault ?? existing.isDefault
        }
      });

      if (data.permissions !== undefined) {
        const permissionIds: string[] = (data.permissions ?? [])
          .map((p) => (typeof p === 'string' ? p : (p.permissionId ?? p.id ?? '')))
          .filter(Boolean);

        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((pId) => ({
              roleId,
              permissionId: pId
            })),
            skipDuplicates: true
          });
        }
      }

      return await tx.role.findUnique({
        where: { id: roleId },
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      });
    });
  }

  /**
   * Delete role
   */
  static async deleteRole(orgId: string | undefined, roleId: string) {
    const existing = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { orgId } : {}) }
    });

    if (!existing) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.userRole.deleteMany({ where: { roleId } }),
      prisma.role.delete({ where: { id: roleId } })
    ]);

    return { success: true };
  }

  /**
   * Add permissions to role
   */
  static async addPermissions(
    orgId: string | undefined,
    roleId: string,
    permissionIds: string[]
  ) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { orgId } : {}) }
    });
    if (!role) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((pId) => ({
          roleId,
          permissionId: pId
        })),
        skipDuplicates: true
      });
    }

    return await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }

  /**
   * Remove permissions from role
   */
  static async removePermissions(
    orgId: string | undefined,
    roleId: string,
    permissionIds: string[]
  ) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { orgId } : {}) },
      select: { id: true }
    });
    if (!role) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { in: permissionIds }
      }
    });

    return await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }
}

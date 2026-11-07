import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

interface UserTarget {
  id: string;
  orgId: string;
}

interface RoleTarget {
  id: string;
  orgId: string;
}

export class UserRoleService {
  private static async findUser(userId: string, orgId?: string): Promise<UserTarget> {
    const user = await prisma.user.findFirst({
      where: { id: userId, ...(orgId ? { orgId } : {}) },
      select: { id: true, orgId: true }
    });

    if (!user) {
      throw new AppError('User not found in your organization', 404, 'USER_NOT_FOUND');
    }

    return user;
  }

  private static async findRole(roleId: string, orgId?: string): Promise<RoleTarget> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { orgId } : {}) },
      select: { id: true, orgId: true }
    });

    if (!role) {
      throw new AppError('Role not found in your organization', 404, 'ROLE_NOT_FOUND');
    }

    return role;
  }

  private static async resolvePair(
    userId: string,
    roleId: string,
    orgId?: string
  ): Promise<{ user: UserTarget; role: RoleTarget }> {
    const user = await this.findUser(userId, orgId);
    const role = await this.findRole(roleId, orgId);

    if (user.orgId !== role.orgId) {
      throw new AppError(
        'User and role must belong to the same organization',
        400,
        'USER_ROLE_ORG_MISMATCH'
      );
    }

    return { user, role };
  }

  static async listForUser(userId: string, orgId?: string) {
    await this.findUser(userId, orgId);

    const userRoles = await prisma.userRole.findMany({
      where: { userId },
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
    });

    return userRoles.map((userRole) => userRole.role);
  }

  static async assign(userId: string, roleId: string, orgId?: string) {
    await this.resolvePair(userId, roleId, orgId);

    const assigned = await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId }
      },
      update: {},
      create: { userId, roleId }
    });

    return assigned;
  }

  static async remove(userId: string, roleId: string, orgId?: string) {
    await this.resolvePair(userId, roleId, orgId);

    await prisma.userRole.deleteMany({
      where: { userId, roleId }
    });

    return { success: true };
  }

  static async removeById(id: string, orgId?: string) {
    const assignment = await prisma.userRole.findUnique({
      where: { id },
      include: {
        user: { select: { orgId: true } },
        role: { select: { orgId: true } }
      }
    });

    if (!assignment) {
      throw new AppError('User role assignment not found', 404, 'USER_ROLE_NOT_FOUND');
    }

    if (
      orgId &&
      (assignment.user.orgId !== orgId || assignment.role.orgId !== orgId)
    ) {
      throw new AppError('User role assignment not found', 404, 'USER_ROLE_NOT_FOUND');
    }

    await prisma.userRole.delete({ where: { id } });
    return { success: true };
  }

  static async replace(
    userId: string,
    previousRoleId: string | undefined,
    nextRoleId: string | undefined,
    orgId?: string
  ) {
    const user = await this.findUser(userId, orgId);
    const previousRole =
      previousRoleId && previousRoleId !== 'null' && previousRoleId !== 'undefined'
        ? await this.findRole(previousRoleId, orgId)
        : undefined;
    const nextRole =
      nextRoleId && nextRoleId !== 'null' && nextRoleId !== 'undefined'
        ? await this.findRole(nextRoleId, orgId)
        : undefined;

    if (previousRole && previousRole.orgId !== user.orgId) {
      throw new AppError('Role not found in your organization', 404, 'ROLE_NOT_FOUND');
    }
    if (nextRole && nextRole.orgId !== user.orgId) {
      throw new AppError(
        'User and role must belong to the same organization',
        400,
        'USER_ROLE_ORG_MISMATCH'
      );
    }

    await prisma.$transaction(async (tx) => {
      if (previousRole) {
        await tx.userRole.deleteMany({
          where: { userId, roleId: previousRole.id }
        });
      }

      if (nextRole) {
        await tx.userRole.upsert({
          where: {
            userId_roleId: { userId, roleId: nextRole.id }
          },
          update: {},
          create: { userId, roleId: nextRole.id }
        });
      } else if (!previousRole) {
        await tx.userRole.deleteMany({ where: { userId } });
      }
    });

    return { success: true };
  }
}

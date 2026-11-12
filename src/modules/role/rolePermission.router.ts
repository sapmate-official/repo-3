import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';
import { resolveOrgContext } from './roleContext.js';
import { AppError } from '../../util/errors.js';
import prisma from '../../db/prisma.js';

export const rolePermissionRouter = Router();

rolePermissionRouter.use(authenticateAny);

interface RolePermissionBody {
  roleId?: string;
  permissionIds?: string[];
  permissions?: string[];
}

const requireScopedRole = async (roleId: string, orgId?: string): Promise<void> => {
  const role = await prisma.role.findFirst({
    where: { id: roleId, ...(orgId ? { orgId } : {}) },
    select: { id: true }
  });

  if (!role) {
    throw new AppError('Role not found in your organization', 404, 'ROLE_NOT_FOUND');
  }
};

rolePermissionRouter.post('/', requirePermission(PERMISSION_KEYS.roleManage), async (req, res, next) => {
  try {
    const body = req.body as RolePermissionBody;
    const roleId = body.roleId;
    const permissionIds = body.permissionIds ?? [];
    const permissions = body.permissions ?? [];
    const ids: string[] = permissionIds.length > 0 ? permissionIds : permissions;

    if (!roleId) {
      throw new AppError('roleId is required', 400, 'ROLE_ID_REQUIRED');
    }

    const orgId = resolveOrgContext(req);
    await requireScopedRole(roleId, orgId);

    if (ids.length > 0) {
      await prisma.rolePermission.createMany({
        data: ids.map((permissionId: string) => ({
          roleId,
          permissionId
        })),
        skipDuplicates: true
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

rolePermissionRouter.delete('/', requirePermission(PERMISSION_KEYS.roleManage), async (req, res, next) => {
  try {
    const body = req.body as RolePermissionBody;
    const roleId = body.roleId;
    const permissionIds = body.permissionIds ?? [];

    if (!roleId) {
      throw new AppError('roleId is required', 400, 'ROLE_ID_REQUIRED');
    }

    const orgId = resolveOrgContext(req);
    await requireScopedRole(roleId, orgId);

    await prisma.rolePermission.deleteMany({
      where: {
        roleId,
        ...(permissionIds.length > 0 ? { permissionId: { in: permissionIds } } : {})
      }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default rolePermissionRouter;

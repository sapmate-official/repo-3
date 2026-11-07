import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import prisma from '../../db/prisma.js';

export const rolePermissionRouter = Router();

rolePermissionRouter.use(authenticateAny);

rolePermissionRouter.post('/', async (req, res, next) => {
  try {
    const { roleId, permissionIds = [], permissions = [] } = req.body;
    const ids: string[] = permissionIds.length > 0 ? permissionIds : permissions;

    if (!roleId) {
      return res.status(400).json({ error: 'roleId is required' });
    }

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

rolePermissionRouter.delete('/', async (req, res, next) => {
  try {
    const { roleId, permissionIds = [] } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'roleId is required' });
    }

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

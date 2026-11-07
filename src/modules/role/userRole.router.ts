import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import prisma from '../../db/prisma.js';

export const userRoleRouter = Router();

userRoleRouter.use(authenticateAny);

userRoleRouter.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
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

    const roles = userRoles.map((ur) => ur.role);
    res.status(200).json(roles);
  } catch (err) {
    next(err);
  }
});

interface UserRoleBody {
  userId?: string;
  roleId?: string;
}

userRoleRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body as UserRoleBody;
    const userId = body.userId;
    const roleId = body.roleId;
    if (!userId || !roleId) {
      return res.status(400).json({ error: 'userId and roleId are required' });
    }

    const assigned = await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId }
      },
      update: {},
      create: { userId, roleId }
    });

    res.status(200).json({ success: true, data: assigned });
  } catch (err) {
    next(err);
  }
});

export default userRoleRouter;

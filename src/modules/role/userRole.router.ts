import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { UserRoleController } from './userRole.controller.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';

export const userRoleRouter = Router();

userRoleRouter.use(authenticateAny);

userRoleRouter.get('/user/:userId', UserRoleController.listForUser);
userRoleRouter.post('/', requirePermission(PERMISSION_KEYS.roleManage), UserRoleController.assign);
userRoleRouter.delete('/', requirePermission(PERMISSION_KEYS.roleManage), UserRoleController.remove);
userRoleRouter.delete('/:id', requirePermission(PERMISSION_KEYS.roleManage), UserRoleController.removeById);

export default userRoleRouter;

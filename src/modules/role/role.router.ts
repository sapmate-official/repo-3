import { Router } from 'express';
import { RoleController } from './role.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';

export const roleRouter = Router();

roleRouter.use(authenticateAny);

roleRouter.get('/hierarchy', RoleController.getHierarchy);
roleRouter.put('/hierarchy', requirePermission(PERMISSION_KEYS.roleManage), RoleController.updateHierarchy);

roleRouter.get('/org/:orgId', requireOrgScope(), RoleController.list);
roleRouter.get('/', requireOrgScope(), RoleController.list);

roleRouter.get('/:id', requireOrgScope(), RoleController.getById);
roleRouter.post('/', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.create);

roleRouter.put('/:roleId', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.update);
roleRouter.patch('/:roleId', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.update);
roleRouter.patch('/', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.update);

roleRouter.delete('/:roleId', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.delete);

roleRouter.post('/:roleId/permissions/add', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.addPermissions);
roleRouter.post('/:roleId/permissions/remove', requireOrgScope(), requirePermission(PERMISSION_KEYS.roleManage), RoleController.removePermissions);

export default roleRouter;

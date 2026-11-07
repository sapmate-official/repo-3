import { Router } from 'express';
import { RoleController } from './role.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';

export const roleRouter = Router();

roleRouter.use(authenticateAny);

roleRouter.get('/hierarchy', RoleController.getHierarchy);
roleRouter.put('/hierarchy', RoleController.updateHierarchy);

roleRouter.get('/org/:orgId', requireOrgScope(), RoleController.list);
roleRouter.get('/', requireOrgScope(), RoleController.list);

roleRouter.get('/:id', requireOrgScope(), RoleController.getById);
roleRouter.post('/', requireOrgScope(), RoleController.create);

roleRouter.put('/:roleId', requireOrgScope(), RoleController.update);
roleRouter.patch('/:roleId', requireOrgScope(), RoleController.update);
roleRouter.patch('/', requireOrgScope(), RoleController.update);

roleRouter.delete('/:roleId', requireOrgScope(), RoleController.delete);

roleRouter.post('/:roleId/permissions/add', requireOrgScope(), RoleController.addPermissions);
roleRouter.post('/:roleId/permissions/remove', requireOrgScope(), RoleController.removePermissions);

export default roleRouter;

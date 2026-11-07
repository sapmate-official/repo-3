import { Router } from 'express';
import { RoleController } from './role.controller.js';
import { authenticateAny } from '../../middleware/auth.js';

export const roleRouter = Router();

roleRouter.use(authenticateAny);

roleRouter.get('/hierarchy', RoleController.getHierarchy);
roleRouter.put('/hierarchy', RoleController.updateHierarchy);

roleRouter.get('/org/:orgId', RoleController.list);
roleRouter.get('/', RoleController.list);

roleRouter.get('/:id', RoleController.getById);
roleRouter.post('/', RoleController.create);

roleRouter.put('/:roleId', RoleController.update);
roleRouter.patch('/:roleId', RoleController.update);
roleRouter.patch('/', RoleController.update);

roleRouter.delete('/:roleId', RoleController.delete);

roleRouter.post('/:roleId/permissions/add', RoleController.addPermissions);
roleRouter.post('/:roleId/permissions/remove', RoleController.removePermissions);

export default roleRouter;

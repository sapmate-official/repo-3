import { Router } from 'express';
import { PermissionController } from './permission.controller.js';
import { authenticateAny } from '../../middleware/auth.js';

export const permissionRouter = Router();

permissionRouter.use(authenticateAny);

permissionRouter.get('/', PermissionController.list);
permissionRouter.get('/org/:orgId', PermissionController.list);
permissionRouter.get('/:id', PermissionController.getById);

permissionRouter.post('/', PermissionController.create);
permissionRouter.put('/:id', PermissionController.update);
permissionRouter.put('/', PermissionController.update);
permissionRouter.patch('/:id', PermissionController.update);
permissionRouter.delete('/:id', PermissionController.delete);
permissionRouter.delete('/', PermissionController.delete);

export default permissionRouter;

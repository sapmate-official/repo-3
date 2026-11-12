import { Router } from 'express';
import { PermissionController } from './permission.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { authenticateSuperAdmin } from '../../middleware/superAdminAuth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';

export const permissionRouter = Router();

permissionRouter.use(authenticateAny);

permissionRouter.get('/', PermissionController.list);
permissionRouter.get('/org/:orgId', requireOrgScope(), PermissionController.list);
permissionRouter.get('/:id', PermissionController.getById);

permissionRouter.post('/', authenticateSuperAdmin, PermissionController.create);
permissionRouter.put('/:id', authenticateSuperAdmin, PermissionController.update);
permissionRouter.put('/', authenticateSuperAdmin, PermissionController.update);
permissionRouter.patch('/:id', authenticateSuperAdmin, PermissionController.update);
permissionRouter.delete('/:id', authenticateSuperAdmin, PermissionController.delete);
permissionRouter.delete('/', authenticateSuperAdmin, PermissionController.delete);

export default permissionRouter;

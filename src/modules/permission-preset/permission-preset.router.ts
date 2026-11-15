import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { PermissionPresetController } from './permission-preset.controller.js';

export const permissionPresetRouter = Router();

// Apply auth & org context across preset endpoints
permissionPresetRouter.use(authenticateAny, requireOrgScope());

permissionPresetRouter.get('/', PermissionPresetController.getPresets);
permissionPresetRouter.get('/org/:orgId', PermissionPresetController.getPresets);
permissionPresetRouter.get('/:id', PermissionPresetController.getPresetById);
permissionPresetRouter.post('/', PermissionPresetController.createPreset);
permissionPresetRouter.put('/:id', PermissionPresetController.updatePreset);
permissionPresetRouter.delete('/:id', PermissionPresetController.deletePreset);

export default permissionPresetRouter;

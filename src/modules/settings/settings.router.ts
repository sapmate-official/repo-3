import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { SettingsController } from './settings.controller.js';

export const settingsRouter = Router();

// Apply auth & org context
settingsRouter.use(authenticateAny, requireOrgScope());

settingsRouter.get('/:orgId', SettingsController.fetchSettings);
settingsRouter.put('/:orgId', SettingsController.updateSettings);
settingsRouter.post('/reset/:orgId', SettingsController.resetSettings);

export default settingsRouter;

import { Router } from 'express';
import { settingsRouter } from '../modules/settings/settings.router.js';
import { permissionPresetRouter } from '../modules/permission-preset/permission-preset.router.js';
import { permissionRouter } from '../modules/permission/permission.router.js';

export const v3Router = Router();

// ==========================================
// API v3 Route Registrations
// ==========================================

v3Router.use('/settings', settingsRouter);
v3Router.use('/permission-preset', permissionPresetRouter);
v3Router.use('/permission', permissionRouter);

export default v3Router;

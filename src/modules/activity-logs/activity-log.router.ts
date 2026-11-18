import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { ActivityLogController } from './activity-log.controller.js';

export const activityLogRouter = Router();

// GET /api/v2/activity-logs - List activity logs with filtering & pagination
activityLogRouter.get(
  '/',
  authenticateAny,
  requireOrgScope(),
  ActivityLogController.list
);

// GET /api/v2/activity-logs/stats - Aggregate statistics by action, entity, user
activityLogRouter.get(
  '/stats',
  authenticateAny,
  requireOrgScope(),
  ActivityLogController.getStats
);

// GET /api/v2/activity-logs/user/:targetUserId/recent - Recent user activities (profile audit history)
activityLogRouter.get(
  '/user/:targetUserId/recent',
  authenticateAny,
  requireOrgScope(),
  ActivityLogController.getRecentByUser
);

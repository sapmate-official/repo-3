import type { Request, Response, NextFunction } from 'express';
import { ActivityService } from './activity-log.service.js';
import {
  activityLogQuerySchema,
  activityStatsQuerySchema,
  userRecentQuerySchema,
  userRecentParamsSchema
} from './activity-log.schema.js';
import { AppError } from '../../util/errors.js';

export class ActivityLogController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const query = activityLogQuerySchema.parse(req.query);
      const result = await ActivityService.list(orgId, req.user!, query);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const query = activityStatsQuerySchema.parse(req.query);
      const stats = await ActivityService.getStats(orgId, req.user!, query.period);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  static async getRecentByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const params = userRecentParamsSchema.parse(req.params);
      const query = userRecentQuerySchema.parse(req.query);

      const data = await ActivityService.getRecentByUser(
        orgId,
        req.user!,
        params.targetUserId,
        query.limit
      );

      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

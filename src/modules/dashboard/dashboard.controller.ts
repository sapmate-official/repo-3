import type { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service.js';
import { AppError } from '../../util/errors.js';

export class DashboardController {
  static async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
      }

      const summary = await DashboardService.getSummary({
        id: req.user.id,
        orgId: req.user.orgId || '',
        isSuperAdmin: req.user.isSuperAdmin,
        roles: req.user.roles,
        permissions: req.user.permissions
      });

      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  }
}

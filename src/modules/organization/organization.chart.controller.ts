import { type NextFunction, type Request, type Response } from 'express';
import { OrganizationChartService } from './organization.chart.service.js';
import { AppError } from '../../util/errors.js';

export class OrganizationChartController {
  static async getChart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId =
        (req.params.orgId as string | undefined) ??
        (req.query.orgId as string | undefined) ??
        req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const result = await OrganizationChartService.getOrganizationChart(orgId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getManagerChart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId =
        (req.params.orgId as string | undefined) ??
        (req.query.orgId as string | undefined) ??
        req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const currentUserId = req.user?.id ?? '';
      const requestedUserId = req.query.userId as string | undefined;

      const result = await OrganizationChartService.getManagerSubordinateChart(
        orgId,
        currentUserId,
        requestedUserId
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

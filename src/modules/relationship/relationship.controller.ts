import { type NextFunction, type Request, type Response } from 'express';
import { RelationshipService } from './relationship.service.js';
import { AppError } from '../../util/errors.js';

export class RelationshipController {
  static async getUserRelationship(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
      }

      const rawTargetUserId = req.params.targetUserId;
      const targetUserId = Array.isArray(rawTargetUserId) ? rawTargetUserId[0] : rawTargetUserId;
      if (!targetUserId) {
        throw new AppError('Target user ID is required.', 400, 'TARGET_USER_REQUIRED');
      }

      const data = await RelationshipService.getRelationshipWithUser(currentUserId, targetUserId);
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  static async getOrganizationRelationship(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
      }

      const data = await RelationshipService.getOrganizationRelationship(currentUserId);
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

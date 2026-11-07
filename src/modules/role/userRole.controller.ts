import type { Request, Response, NextFunction } from 'express';
import { UserRoleService } from './userRole.service.js';
import { resolveOrgContext } from './roleContext.js';
import { AppError } from '../../util/errors.js';

const strParam = (value: unknown): string => {
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === 'string' ? first : '';
  }
  return typeof value === 'string' && value !== 'undefined' && value !== 'null' ? value : '';
};

interface UserRoleBody {
  userId?: string;
  roleId?: string;
}

export class UserRoleController {
  static async listForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId);
      if (!userId) {
        throw new AppError('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      const orgId = resolveOrgContext(req);
      const roles = await UserRoleService.listForUser(userId, orgId);
      res.status(200).json(roles);
    } catch (error) {
      next(error);
    }
  }

  static async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as UserRoleBody;
      if (!body.userId || !body.roleId) {
        throw new AppError('userId and roleId are required', 400, 'USER_ROLE_INPUT_REQUIRED');
      }

      const orgId = resolveOrgContext(req);
      const assigned = await UserRoleService.assign(body.userId, body.roleId, orgId);
      res.status(200).json({ success: true, data: assigned });
    } catch (error) {
      next(error);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as UserRoleBody;
      if (!body.userId || !body.roleId) {
        throw new AppError('userId and roleId are required', 400, 'USER_ROLE_INPUT_REQUIRED');
      }

      const orgId = resolveOrgContext(req);
      const result = await UserRoleService.remove(body.userId, body.roleId, orgId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async removeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('User role ID is required', 400, 'USER_ROLE_ID_REQUIRED');
      }

      const orgId = resolveOrgContext(req);
      const result = await UserRoleService.removeById(id, orgId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async replaceLegacy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId);
      if (!userId) {
        throw new AppError('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      const orgId = resolveOrgContext(req);
      const result = await UserRoleService.replace(
        userId,
        strParam(req.params.prevRoleId),
        strParam(req.params.roleId),
        orgId
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

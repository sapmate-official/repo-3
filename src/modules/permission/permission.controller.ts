import type { Request, Response, NextFunction } from 'express';
import { PermissionService, type CreatePermissionInput, type UpdatePermissionInput } from './permission.service.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' ? first : '';
  }
  if (typeof val === 'string' && val !== 'undefined' && val !== 'null') {
    return val;
  }
  return '';
};

export class PermissionController {
  static async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const permissions = await PermissionService.listPermissions();
      res.status(200).json(permissions);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Permission ID required', 400, 'PARAM_MISSING');
      const permission = await PermissionService.getById(id);
      res.status(200).json(permission);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const permission = await PermissionService.create(req.body as CreatePermissionInput);
      res.status(201).json(permission);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as UpdatePermissionInput & { id?: string };
      const id = strParam(req.params.id) || strParam(body.id);
      if (!id) throw new AppError('Permission ID required', 400, 'PARAM_MISSING');
      const updated = await PermissionService.update(id, body);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as { id?: string };
      const id = strParam(req.params.id) || strParam(body.id);
      if (!id) throw new AppError('Permission ID required', 400, 'PARAM_MISSING');
      const result = await PermissionService.delete(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

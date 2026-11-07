import type { Request, Response, NextFunction } from 'express';
import { PermissionService } from './permission.service.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string => {
  if (Array.isArray(val)) return val[0] || '';
  if (typeof val === 'string' && val !== 'undefined' && val !== 'null') return val;
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
      const permission = await PermissionService.create(req.body);
      res.status(201).json(permission);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id) || strParam(req.body.id);
      if (!id) throw new AppError('Permission ID required', 400, 'PARAM_MISSING');
      const updated = await PermissionService.update(id, req.body);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id) || strParam(req.body.id);
      if (!id) throw new AppError('Permission ID required', 400, 'PARAM_MISSING');
      const result = await PermissionService.delete(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

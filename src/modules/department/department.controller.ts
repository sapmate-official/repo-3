import type { Request, Response, NextFunction } from 'express';
import { DepartmentService } from './department.service.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string => (Array.isArray(val) ? val[0] : (val as string) || '');

export class DepartmentController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const departments = await DepartmentService.listDepartments(orgId);
      res.status(200).json(departments);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const department = await DepartmentService.getDepartmentById(orgId, id);
      res.status(200).json(department);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.body.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const department = await DepartmentService.createDepartment(orgId, req.body);
      res.status(201).json(department);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const department = await DepartmentService.updateDepartment(orgId, id, req.body);
      res.status(200).json(department);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const result = await DepartmentService.deleteDepartment(orgId, id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

import type { Request, Response, NextFunction } from 'express';
import { DepartmentService, type DepartmentCreateInput, type DepartmentUpdateInput } from './department.service.js';
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

export class DepartmentController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || (req.user?.orgId ?? '');
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
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || (req.user?.orgId ?? '');
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

  static async getEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || (req.user?.orgId ?? '');
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const department = await DepartmentService.getDepartmentById(orgId, strParam(req.params.id));
      const users = (department as { users?: unknown[] }).users ?? [];
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  }

  static async setHead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || (req.user?.orgId ?? '');
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const userId = strParam(req.params.userId);
      if (!userId) {
        throw new AppError('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      const department = await DepartmentService.updateDepartment(orgId, strParam(req.params.id), {
        headId: userId
      });
      res.status(200).json(department);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as DepartmentCreateInput & { orgId?: string };
      const orgId = strParam(body.orgId) || strParam(req.query.orgId) || (req.user?.orgId ?? '');
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const department = await DepartmentService.createDepartment(orgId, body);
      res.status(201).json(department);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as DepartmentUpdateInput;
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || (req.user?.orgId ?? '');
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const department = await DepartmentService.updateDepartment(orgId, id, body);
      res.status(200).json(department);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
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

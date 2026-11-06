import type { Request, Response, NextFunction } from 'express';
import { EmployeeService } from './employee.service.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string => (Array.isArray(val) ? val[0] : (val as string) || '');

export class EmployeeController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || strParam(req.headers['x-org-id']) || req.user?.orgId || '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const result = await EmployeeService.listEmployees(orgId, req.query);
      if (req.headers['x-legacy-format'] === 'true' || req.query.legacy === 'true') {
        res.status(200).json(result.data);
        return;
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Legacy route: GET /api/v2/organization/employee-list/:orgId or GET /api/v1/manager/employee-list
  static async listLegacy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || strParam(req.headers['x-org-id']) || req.user?.orgId || '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const result = await EmployeeService.listEmployees(orgId, { limit: 100 });
      res.status(200).json(result.data);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || strParam(req.headers['x-org-id']) || req.user?.orgId || '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const employee = await EmployeeService.getEmployeeById(orgId, id);
      res.status(200).json(employee);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Legacy wrapper may wrap body inside { data: { ... }, orgId: "..." }
      const bodyData = req.body.data ? { ...req.body.data, orgId: req.body.orgId } : req.body;
      const orgId = strParam(bodyData.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const employee = await EmployeeService.createEmployee(orgId, bodyData);
      res.status(201).json(employee);
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

      const employeeId = strParam(req.params.id) || strParam(req.query.id);
      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'EMPLOYEE_ID_REQUIRED');
      }

      const employee = await EmployeeService.updateEmployee(orgId, employeeId, req.body);
      res.status(200).json(employee);
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

      const employeeId = strParam(req.params.id) || strParam(req.query.id);
      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'EMPLOYEE_ID_REQUIRED');
      }

      const result = await EmployeeService.deleteEmployee(orgId, employeeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async generateId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const result = await EmployeeService.generateEmployeeId(orgId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async checkId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const employeeId = strParam(req.params.employeeId);
      const result = await EmployeeService.checkEmployeeId(orgId, employeeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

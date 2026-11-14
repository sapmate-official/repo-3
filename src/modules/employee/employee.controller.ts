import type { Request, Response, NextFunction } from 'express';
import { EmployeeService } from './employee.service.js';
import { createEmployeeSchema, updateEmployeeSchema } from './employee.schema.js';
import { filterEmployeeUpdateInput, isSelfIdentifier } from './employee.authorization.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

const resolveEmployeeOrgId = async (
  req: Request,
  employeeId: string
): Promise<string> => {
  const body = req.body as Record<string, unknown> | undefined;
  const nestedBody =
    typeof body?.data === 'object' && body.data !== null && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : undefined;
  const requestedOrgId =
    strParam(req.params.orgId) ??
    strParam(req.query.orgId) ??
    strParam(body?.orgId) ??
    strParam(nestedBody?.orgId) ??
    strParam(req.headers['x-org-id']);

  if (!req.user?.isSuperAdmin && req.user?.orgId) {
    return req.user.orgId;
  }

  if (requestedOrgId) {
    return requestedOrgId;
  }

  if (req.user?.isSuperAdmin) {
    const employeeOrgId = await EmployeeService.getEmployeeOrgId(employeeId);
    if (employeeOrgId) {
      return employeeOrgId;
    }
  }

  throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
};

export class EmployeeController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? strParam(req.headers['x-org-id']) ?? req.user?.orgId ?? '';
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
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? strParam(req.headers['x-org-id']) ?? req.user?.orgId ?? '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const limit = Number(req.query.limit);
      const result = await EmployeeService.listEmployees(orgId, {
        ...(req.query as Record<string, unknown>),
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : 100
      });
      res.status(200).json(result.data);
    } catch (error) {
      next(error);
    }
  }

  static async listSubordinates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? strParam(req.headers['x-org-id']) ?? req.user?.orgId ?? '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const managerId = strParam(req.params.userId) ?? strParam(req.query.managerId);
      if (!managerId) {
        throw new AppError('Manager ID is required', 400, 'MANAGER_ID_REQUIRED');
      }

      const subordinates = await EmployeeService.listSubordinates(orgId, managerId);
      res.status(200).json(subordinates);
    } catch (error) {
      next(error);
    }
  }

  static async fetchManagers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? strParam(req.headers['x-org-id']) ?? req.user?.orgId ?? '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const managers = await EmployeeService.fetchManagers(orgId);
      res.status(200).json(managers);
    } catch (error) {
      next(error);
    }
  }

  static async getPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId ?? '';
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const permissions = await EmployeeService.getEmployeePermissions(orgId, strParam(req.params.id) ?? '');
      res.status(200).json(permissions);
    } catch (error) {
      next(error);
    }
  }

  static async assignDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId ?? '';
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const employee = await EmployeeService.updateEmployee(orgId, strParam(req.params.id) ?? '', {
        departmentId: strParam(req.params.departmentId) ?? null
      });
      res.status(200).json(employee);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? strParam(req.headers['x-org-id']) ?? req.user?.orgId ?? '';
      if (!orgId && !req.user?.isSuperAdmin) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const employee = await EmployeeService.getEmployeeById(orgId, id);
      res.status(200).json({
        ...employee,
        user: employee
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = req.body as Record<string, unknown>;
      const nested = typeof rawBody.data === 'object' && rawBody.data !== null ? (rawBody.data as Record<string, unknown>) : null;
      const bodyData = nested ? { ...nested, orgId: rawBody.orgId ?? nested.orgId } : rawBody;
      const requestedOrgId =
        strParam(bodyData.orgId) ?? strParam(req.params.orgId) ?? strParam(req.query.orgId);
      const orgId = req.user?.isSuperAdmin ? requestedOrgId : (req.user?.orgId ?? requestedOrgId);
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const input = createEmployeeSchema.parse(bodyData);
      const employee = await EmployeeService.createEmployee(orgId, input);
      res.status(201).json(employee);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = strParam(req.params.id) ?? strParam(req.query.id);
      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'EMPLOYEE_ID_REQUIRED');
      }

      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
      }

      const orgId = await resolveEmployeeOrgId(req, employeeId);
      const parsed = updateEmployeeSchema.parse(req.body);
      const input = filterEmployeeUpdateInput(
        parsed,
        req.user,
        isSelfIdentifier(req.user, employeeId)
      );
      const employee = await EmployeeService.updateEmployee(orgId, employeeId, input);
      res.status(200).json(employee);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = strParam(req.params.id) ?? strParam(req.query.id);
      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'EMPLOYEE_ID_REQUIRED');
      }

      const orgId = await resolveEmployeeOrgId(req, employeeId);
      const result = await EmployeeService.deleteEmployee(orgId, employeeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async generateId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
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
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const employeeId = strParam(req.params.employeeId) ?? '';
      const result = await EmployeeService.checkEmployeeId(orgId, employeeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

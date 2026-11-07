import type { Request, Response, NextFunction } from 'express';
import { RoleService } from './role.service.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string => {
  if (Array.isArray(val)) return val[0] || '';
  if (typeof val === 'string' && val !== 'undefined' && val !== 'null') return val;
  return '';
};

export class RoleController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const roles = await RoleService.listRoles(orgId);
      res.status(200).json(roles);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId || '';
      const id = strParam(req.params.id) || strParam(req.params.roleId);
      if (!id) {
        throw new AppError('Role ID required', 400, 'ROLE_ID_MISSING');
      }

      const role = await RoleService.getRoleById(orgId, id);
      res.status(200).json(role);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.body.orgId || strParam(req.params.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const role = await RoleService.createRole(orgId, req.body);
      res.status(201).json(role);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || req.user?.orgId || '';
      const roleId = strParam(req.params.roleId) || strParam(req.params.id) || req.body.roleId || req.body.id;
      if (!roleId) {
        throw new AppError('Role ID required', 400, 'ROLE_ID_MISSING');
      }

      const updated = await RoleService.updateRole(orgId, roleId, req.body);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || req.user?.orgId || '';
      const roleId = strParam(req.params.roleId) || strParam(req.params.id);
      if (!roleId) {
        throw new AppError('Role ID required', 400, 'ROLE_ID_MISSING');
      }

      const result = await RoleService.deleteRole(orgId, roleId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async addPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roleId = strParam(req.params.roleId) || strParam(req.params.id);
      const permissions: string[] = Array.isArray(req.body.permissions)
        ? req.body.permissions
        : Array.isArray(req.body.permissionIds)
        ? req.body.permissionIds
        : [];

      const role = await RoleService.addPermissions(roleId, permissions);
      res.status(200).json({ success: true, role });
    } catch (error) {
      next(error);
    }
  }

  static async removePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roleId = strParam(req.params.roleId) || strParam(req.params.id);
      const permissions: string[] = Array.isArray(req.body.permissions)
        ? req.body.permissions
        : Array.isArray(req.body.permissionIds)
        ? req.body.permissionIds
        : [];

      const role = await RoleService.removePermissions(roleId, permissions);
      res.status(200).json({ success: true, role });
    } catch (error) {
      next(error);
    }
  }

  static async getHierarchy(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json([]);
    } catch (error) {
      next(error);
    }
  }

  static async updateHierarchy(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

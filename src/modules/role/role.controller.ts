import type { Request, Response, NextFunction } from 'express';
import { RoleService, type CreateRoleInput, type UpdateRoleInput } from './role.service.js';
import { resolveOrgContext } from './roleContext.js';
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

export class RoleController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = resolveOrgContext(req, { required: true });
      const roles = await RoleService.listRoles(orgId);
      res.status(200).json(roles);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = resolveOrgContext(req);
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
      const body = req.body as CreateRoleInput;
      const orgId = resolveOrgContext(req, { required: true });
      const role = await RoleService.createRole(orgId, body);
      res.status(201).json(role);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as UpdateRoleInput & { roleId?: string; id?: string };
      const orgId = resolveOrgContext(req);
      const roleId = strParam(req.params.roleId) || strParam(req.params.id) || (body.roleId ?? body.id ?? '');
      if (!roleId) {
        throw new AppError('Role ID required', 400, 'ROLE_ID_MISSING');
      }

      const updated = await RoleService.updateRole(orgId, roleId, body);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = resolveOrgContext(req);
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
      const orgId = resolveOrgContext(req);
      const roleId = strParam(req.params.roleId) || strParam(req.params.id);
      const body = req.body as { permissions?: string[]; permissionIds?: string[] };
      const permissions: string[] = Array.isArray(body.permissions)
        ? body.permissions
        : Array.isArray(body.permissionIds)
        ? body.permissionIds
        : [];

      const role = await RoleService.addPermissions(orgId, roleId, permissions);
      res.status(200).json({ success: true, role });
    } catch (error) {
      next(error);
    }
  }

  static async removePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = resolveOrgContext(req);
      const roleId = strParam(req.params.roleId) || strParam(req.params.id);
      const body = req.body as { permissions?: string[]; permissionIds?: string[] };
      const permissions: string[] = Array.isArray(body.permissions)
        ? body.permissions
        : Array.isArray(body.permissionIds)
        ? body.permissionIds
        : [];

      const role = await RoleService.removePermissions(orgId, roleId, permissions);
      res.status(200).json({ success: true, role });
    } catch (error) {
      next(error);
    }
  }

  static getHierarchy(_req: Request, res: Response): void {
    res.status(200).json([]);
  }

  static updateHierarchy(_req: Request, res: Response): void {
    res.status(200).json({ success: true });
  }
}

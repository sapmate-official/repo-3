import type { Request, Response, NextFunction } from 'express';
import '../types/auth.js';

export const requirePermission = (
  permissionKey: string,
  allowedRoles: string[] = ['Org_Admin']
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required.',
        code: 'UNAUTHENTICATED'
      });
      return;
    }

    // Platform super-admins are not scoped to an organization and hold all permissions.
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    // Org_Admin role bypasses individual permission checks for convenience
    const hasAllowedRole = req.user.roles.some(r => allowedRoles.includes(r));
    if (hasAllowedRole) {
      next(); return;
    }

    // Check individual permission key
    const hasPermission = req.user.permissions.includes(permissionKey);
    if (!hasPermission) {
      res.status(403).json({
        error: `Access denied. Missing required permission: '${permissionKey}'`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    next();
  };
};

export const requireSelfOrPermission = (
  permissionKey: string,
  paramName = 'id',
  allowedRoles: string[] = ['Org_Admin']
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required.',
        code: 'UNAUTHENTICATED'
      });
      return;
    }

    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const requestedId = req.params[paramName] ?? req.query[paramName];
    const isSelf =
      requestedId === req.user.id ||
      (!!req.user.employeeId && requestedId === req.user.employeeId);
    const hasAllowedRole = req.user.roles.some(r => allowedRoles.includes(r));
    const hasPermission = req.user.permissions.includes(permissionKey);

    if (isSelf || hasAllowedRole || hasPermission) {
      next();
      return;
    }

    res.status(403).json({
      error: `Access denied. Missing required permission: '${permissionKey}'`,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  };
};

export const requireRole = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required.',
        code: 'UNAUTHENTICATED'
      });
      return;
    }

    const hasRole = req.user.roles.some(r => requiredRoles.includes(r));
    if (!hasRole) {
      res.status(403).json({
        error: `Access denied. Requires one of roles: [${requiredRoles.join(', ')}]`,
        code: 'INSUFFICIENT_ROLE'
      });
      return;
    }

    next();
  };
};

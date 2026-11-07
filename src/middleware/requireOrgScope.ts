import { type NextFunction, type Request, type Response } from 'express';
import '../types/auth.js';

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const requireOrgScope = (paramName = 'orgId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.orgId) {
      res.status(401).json({
        error: 'Authentication and active organization context required.',
        code: 'UNAUTHENTICATED'
      });
      return;
    }

    // Platform super-admins may operate across tenant boundaries.
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const query = req.query as Record<string, unknown> | undefined;
    const requestedOrgId =
      readString(req.params[paramName]) ??
      readString(body?.[paramName]) ??
      readString(query?.[paramName]);

    // If no orgId is specified in request, force the user's authenticated orgId
    if (!requestedOrgId) {
      req.params[paramName] = req.user.orgId;
      next();
      return;
    }

    // Enforce tenant boundary: user cannot access other organizations
    if (requestedOrgId !== req.user.orgId) {
      res.status(403).json({
        error: 'Access denied. You cannot access data outside your organization.',
        code: 'TENANT_MISMATCH'
      });
      return;
    }

    next();
  };
};

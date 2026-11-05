import { Request, Response, NextFunction } from 'express';
import '../types/auth.js';

export const requireOrgScope = (
  paramName: string = 'orgId'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.orgId) {
      res.status(401).json({
        error: 'Authentication and active organization context required.',
        code: 'UNAUTHENTICATED'
      });
      return;
    }

    const requestedOrgId = req.params[paramName] || req.body?.[paramName] || req.query?.[paramName];

    // If no orgId is specified in request, force the user's authenticated orgId
    if (!requestedOrgId) {
      req.params[paramName] = req.user.orgId;
      return next();
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

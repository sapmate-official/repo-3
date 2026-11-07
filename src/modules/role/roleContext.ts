import type { Request } from 'express';
import { AppError } from '../../util/errors.js';

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value !== 'undefined' && value !== 'null'
    ? value
    : undefined;

export interface OrgContextOptions {
  required?: boolean;
}

export function resolveOrgContext(req: Request, options: { required: true }): string;
export function resolveOrgContext(
  req: Request,
  options?: OrgContextOptions
): string | undefined;
export function resolveOrgContext(
  req: Request,
  options: OrgContextOptions = {}
): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const explicitOrgId =
    readString(req.params.orgId) ??
    readString(req.query.orgId) ??
    readString(body?.orgId);

  if (req.user?.isSuperAdmin) {
    if (!explicitOrgId && options.required) {
      throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
    }
    return explicitOrgId;
  }

  const userOrgId = readString(req.user?.orgId);
  if (!userOrgId) {
    throw new AppError('Authentication and organization context required', 401, 'UNAUTHENTICATED');
  }

  if (explicitOrgId && explicitOrgId !== userOrgId) {
    throw new AppError(
      'Access denied. You cannot access data outside your organization.',
      403,
      'TENANT_MISMATCH'
    );
  }

  return userOrgId;
}

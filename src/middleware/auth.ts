import { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma.js';
import {
  TokenTypeError,
  verifySuperAdminAccessToken,
  verifyUserAccessToken,
  type SuperAdminAccessClaims,
  type UserAccessClaims
} from '../modules/auth/token.service.js';
import '../types/auth.js';

interface UserRecord {
  id: string;
  email: string;
  employeeId: string;
  orgId: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  roles: {
    role: {
      name: string;
      permissions: { permission: { key: string | null } }[];
    } | null;
  }[];
}

const userSelect = {
  id: true,
  email: true,
  employeeId: true,
  orgId: true,
  firstName: true,
  lastName: true,
  status: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: {
                select: {
                  key: true
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

const extractToken = (req: Request, allowSuperAdminCookie = false): string | undefined => {
  const authHeader = req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  const cookies = req.cookies as Record<string, unknown> | undefined;
  const cookieToken =
    cookies?.accessToken ??
    (allowSuperAdminCookie ? cookies?.superAdminToken : undefined);

  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
};

const respondAuthError = (error: unknown, res: Response): boolean => {
  if (error instanceof jwt.TokenExpiredError) {
    res.status(401).json({
      error: 'Session expired. Please log in again.',
      code: 'TOKEN_EXPIRED'
    });
    return true;
  }

  if (error instanceof TokenTypeError) {
    res.status(401).json({
      error: 'Invalid token type.',
      code: 'INVALID_TOKEN_TYPE'
    });
    return true;
  }

  if (error instanceof jwt.JsonWebTokenError) {
    res.status(401).json({
      error: 'Invalid authentication token.',
      code: 'TOKEN_INVALID'
    });
    return true;
  }

  return false;
};

const attachUser = (req: Request, user: UserRecord): void => {
  const roles: string[] = [];
  const permissions = new Set<string>();

  for (const userRole of user.roles) {
    if (userRole.role?.name) {
      roles.push(userRole.role.name);
    }
    for (const rolePermission of userRole.role?.permissions ?? []) {
      if (rolePermission.permission?.key) {
        permissions.add(rolePermission.permission.key);
      }
    }
  }

  req.user = {
    id: user.id,
    email: user.email,
    employeeId: user.employeeId,
    orgId: user.orgId,
    firstName: user.firstName,
    lastName: user.lastName,
    roles,
    permissions: Array.from(permissions),
    isSuperAdmin: false
  };
};

const authenticateUserToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
  decoded: UserAccessClaims
): Promise<void> => {
  let user: UserRecord | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: userSelect
    });
  } catch (error) {
    next(error);
    return;
  }

  if (user?.status !== 'active') {
    res.status(401).json({
      error: 'User not found or account is not active.',
      code: 'USER_INACTIVE'
    });
    return;
  }

  attachUser(req, user);
  next();
};

const authenticateSuperAdminToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
  decoded: SuperAdminAccessClaims
): Promise<boolean> => {
  let superAdmin: { id: string; email: string; name: string } | null;
  try {
    superAdmin = await prisma.superAdmin.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true }
    });
  } catch (error) {
    next(error);
    return true;
  }

  if (!superAdmin) {
    res.status(401).json({
      error: 'Super-admin account not found.',
      code: 'SUPERADMIN_NOT_FOUND'
    });
    return true;
  }

  req.superAdmin = {
    id: superAdmin.id,
    email: superAdmin.email,
    name: superAdmin.name,
    isSuperAdmin: true
  };
  req.user = {
    id: superAdmin.id,
    email: superAdmin.email,
    orgId: 'platform-superadmin',
    firstName: superAdmin.name,
    lastName: '',
    isSuperAdmin: true,
    roles: ['SUPER_ADMIN'],
    permissions: ['*']
  };
  next();
  return true;
};

export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: 'Authentication required. No token provided.',
      code: 'TOKEN_MISSING'
    });
    return;
  }

  let decoded: UserAccessClaims;
  try {
    decoded = verifyUserAccessToken(token);
  } catch (error) {
    if (!respondAuthError(error, res)) {
      next(error);
    }
    return;
  }

  await authenticateUserToken(req, res, next, decoded);
};

export const authenticateAny = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req, true);
  if (!token) {
    res.status(401).json({
      error: 'Authentication required. No token provided.',
      code: 'TOKEN_MISSING'
    });
    return;
  }

  // 1. Try a super-admin token first.
  try {
    const superAdmin = verifySuperAdminAccessToken(token);
    const handled = await authenticateSuperAdminToken(req, res, next, superAdmin);
    if (handled) {
      return;
    }
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      next(error);
      return;
    }
  }

  // 2. Fall back to a standard user token.
  let decoded: UserAccessClaims;
  try {
    decoded = verifyUserAccessToken(token);
  } catch (error) {
    if (!respondAuthError(error, res)) {
      next(error);
    }
    return;
  }

  await authenticateUserToken(req, res, next, decoded);
};

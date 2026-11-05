import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import prisma from '../db/prisma.js';
import '../types/auth.js';

interface UserJwtPayload {
  id: string;
  email: string;
  orgId: string;
  typ?: string;
  iat?: number;
  exp?: number;
}

export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header('Authorization');
    const cookieToken = req.cookies?.accessToken;

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      res.status(401).json({
        error: 'Authentication required. No token provided.',
        code: 'TOKEN_MISSING'
      });
      return;
    }

    // Verify token with user access secret
    const decoded = jwt.verify(token, env.USER_ACCESS_TOKEN_SECRET, {
      clockTolerance: 30
    }) as UserJwtPayload;

    // Prevent token type confusion (SEC-002)
    if (decoded.typ && decoded.typ !== 'user') {
      res.status(401).json({
        error: 'Invalid token type.',
        code: 'INVALID_TOKEN_TYPE'
      });
      return;
    }

    const userId = decoded.id;
    if (!userId) {
      res.status(401).json({
        error: 'Malformed token payload.',
        code: 'MALFORMED_TOKEN'
      });
      return;
    }

    // Fetch user and resolved roles/permissions from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
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
      }
    });

    if (!user || user.status !== 'active') {
      res.status(401).json({
        error: 'User not found or account is not active.',
        code: 'USER_INACTIVE'
      });
      return;
    }

    // Extract roles and flat array of permission keys
    const roles: string[] = [];
    const permissionsSet = new Set<string>();

    for (const userRole of user.roles) {
      if (userRole.role?.name) {
        roles.push(userRole.role.name);
      }
      for (const rolePerm of userRole.role?.permissions || []) {
        if (rolePerm.permission?.key) {
          permissionsSet.add(rolePerm.permission.key);
        }
      }
    }

    // Attach strongly typed authenticated user
    req.user = {
      id: user.id,
      email: user.email,
      orgId: user.orgId,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions: Array.from(permissionsSet),
      isSuperAdmin: false
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Session expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }

    res.status(401).json({
      error: 'Invalid authentication token.',
      code: 'TOKEN_INVALID'
    });
  }
};

export const authenticateAny = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header('Authorization');
    const cookieToken = req.cookies?.accessToken || req.cookies?.superAdminToken;

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      res.status(401).json({
        error: 'Authentication required. No token provided.',
        code: 'TOKEN_MISSING'
      });
      return;
    }

    // 1. Try SuperAdmin token
    try {
      const saDecoded = jwt.verify(token, env.SUPER_ADMIN_ACCESS_TOKEN_SECRET) as any;
      if (saDecoded.typ === 'super_admin') {
        const superAdmin = await prisma.superAdmin.findUnique({
          where: { id: saDecoded.id },
          select: { id: true, email: true, name: true }
        });

        if (superAdmin) {
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
          return;
        }
      }
    } catch {
      // Continue to try standard user token
    }

    // 2. Try User token
    const decoded = jwt.verify(token, env.USER_ACCESS_TOKEN_SECRET, {
      clockTolerance: 30
    }) as UserJwtPayload;

    if (decoded.typ && decoded.typ !== 'user') {
      res.status(401).json({
        error: 'Invalid token type.',
        code: 'INVALID_TOKEN_TYPE'
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
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
      }
    });

    if (!user || user.status !== 'active') {
      res.status(401).json({
        error: 'User not found or account is not active.',
        code: 'USER_INACTIVE'
      });
      return;
    }

    const roles: string[] = [];
    const permissionsSet = new Set<string>();

    for (const userRole of user.roles) {
      if (userRole.role?.name) {
        roles.push(userRole.role.name);
      }
      for (const rolePerm of userRole.role?.permissions || []) {
        if (rolePerm.permission?.key) {
          permissionsSet.add(rolePerm.permission.key);
        }
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      orgId: user.orgId,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions: Array.from(permissionsSet),
      isSuperAdmin: false
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Session expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }

    res.status(401).json({
      error: 'Invalid authentication token.',
      code: 'TOKEN_INVALID'
    });
  }
};

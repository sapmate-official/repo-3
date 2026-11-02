import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import prisma from '../db/prisma.js';
import '../types/auth.js';

interface SuperAdminJwtPayload {
  id: string;
  email: string;
  typ: string;
  iat?: number;
  exp?: number;
}

export const authenticateSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header('Authorization');
    const cookieToken = req.cookies?.superAdminToken || req.cookies?.accessToken;

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      res.status(401).json({
        error: 'Super-admin authentication required. No token provided.',
        code: 'SUPERADMIN_TOKEN_MISSING'
      });
      return;
    }

    // Verify token with dedicated super-admin access secret
    const decoded = jwt.verify(token, env.SUPER_ADMIN_ACCESS_TOKEN_SECRET, {
      clockTolerance: 30
    }) as SuperAdminJwtPayload;

    // Strict type check to prevent user token escalation (SEC-002)
    if (decoded.typ !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden. Super-admin token required.',
        code: 'FORBIDDEN_TOKEN_TYPE'
      });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (!superAdmin) {
      res.status(403).json({
        error: 'Super-admin account not found.',
        code: 'SUPERADMIN_NOT_FOUND'
      });
      return;
    }

    req.superAdmin = {
      id: superAdmin.id,
      email: superAdmin.email,
      name: superAdmin.name,
      isSuperAdmin: true
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Super-admin session expired.',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }

    res.status(401).json({
      error: 'Invalid super-admin token.',
      code: 'TOKEN_INVALID'
    });
  }
};

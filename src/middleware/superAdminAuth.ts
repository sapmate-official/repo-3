import { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma.js';
import { TokenTypeError, verifySuperAdminAccessToken } from '../modules/auth/token.service.js';
import '../types/auth.js';

const extractToken = (req: Request): string | undefined => {
  const authHeader = req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  const cookies = req.cookies as Record<string, unknown> | undefined;
  const cookieToken = cookies?.superAdminToken ?? cookies?.accessToken;
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
};

const respondAuthError = (error: unknown, res: Response): boolean => {
  if (error instanceof jwt.TokenExpiredError) {
    res.status(401).json({
      error: 'Super-admin session expired.',
      code: 'TOKEN_EXPIRED'
    });
    return true;
  }

  if (error instanceof TokenTypeError) {
    res.status(403).json({
      error: 'Forbidden. Super-admin token required.',
      code: 'FORBIDDEN_TOKEN_TYPE'
    });
    return true;
  }

  if (error instanceof jwt.JsonWebTokenError) {
    res.status(401).json({
      error: 'Invalid super-admin token.',
      code: 'TOKEN_INVALID'
    });
    return true;
  }

  return false;
};

export const authenticateSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: 'Super-admin authentication required. No token provided.',
      code: 'SUPERADMIN_TOKEN_MISSING'
    });
    return;
  }

  let decoded: { id: string; email: string };
  try {
    decoded = verifySuperAdminAccessToken(token);
  } catch (error) {
    if (!respondAuthError(error, res)) {
      next(error);
    }
    return;
  }

  let superAdmin: { id: string; email: string; name: string } | null;
  try {
    superAdmin = await prisma.superAdmin.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true
      }
    });
  } catch (error) {
    next(error);
    return;
  }

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
};

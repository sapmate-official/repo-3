import { type NextFunction, type Request, type Response } from 'express';
import { AuthService } from './auth.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isAppError } from '../../util/errors.js';
import { parseDurationMs } from '../../util/ttl.js';
import type { SessionMeta } from './authSession.service.js';

const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
  domain: env.COOKIE_DOMAIN
};

const ACCESS_COOKIE_OPTIONS = {
  ...cookieBase,
  maxAge: parseDurationMs(env.ACCESS_TOKEN_TTL)
};

const REFRESH_COOKIE_OPTIONS = {
  ...cookieBase,
  maxAge: parseDurationMs(env.REFRESH_TOKEN_TTL)
};

const CLEAR_COOKIE_OPTIONS = { ...cookieBase };

const sessionMeta = (req: Request): SessionMeta => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null
});

const respondError = (error: unknown, res: Response, next: NextFunction): void => {
  if (isAppError(error)) {
    logger.warn({ code: error.code }, error.message);
    res.status(error.statusCode).json({ message: error.message, code: error.code });
    return;
  }

  next(error);
};

export class AuthController {
  // POST /check-email
  static async checkEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email: string };
      const result = await AuthService.checkEmail(email);
      res.status(200).json(result);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  // POST /verify-password & POST /login
  static async verifyPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, orgId } = req.body as {
        email: string;
        password: string;
        orgId?: string;
      };
      const { response, tokens } = await AuthService.verifyPassword(
        email,
        password,
        orgId,
        sessionMeta(req)
      );

      if (tokens) {
        res.cookie('accessToken', tokens.accessToken, ACCESS_COOKIE_OPTIONS);
        res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
      }

      res.status(200).json(response);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  // POST /verify-otp
  static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, sessionToken, otpCode, orgId } = req.body as {
        email?: string;
        sessionToken?: string;
        otpCode: string;
        orgId?: string;
      };
      const { response, tokens } = await AuthService.verifyOtp({
        email,
        sessionToken,
        otpCode,
        orgId,
        meta: sessionMeta(req)
      });

      res.cookie('accessToken', tokens.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json(response);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  // POST /set-password
  static async setPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { password, verificationToken } = req.body as {
        password: string;
        verificationToken: string;
      };
      const user = await AuthService.setPassword(password, verificationToken);
      res.status(200).json(user);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  // GET /validate-token
  static async validateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ message: 'Invalid user authentication' });
        return;
      }

      const profile = await AuthService.getUserProfile(
        req.user.id,
        req.user.orgId,
        req.user.isSuperAdmin
      );

      res.status(200).json({
        message: 'Token is valid',
        user: profile,
        authenticated: true
      });
    } catch (error) {
      if (isAppError(error)) {
        logger.warn({ code: error.code }, error.message);
        res.status(401).json({
          message: 'Token is invalid or user inactive',
          code: error.code
        });
        return;
      }

      next(error);
    }
  }

  // POST /refresh-token
  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cookies = req.cookies as Record<string, string> | undefined;
      const body = req.body as { refreshToken?: string } | undefined;
      const incomingRefreshToken = body?.refreshToken ?? cookies?.refreshToken;
      if (!incomingRefreshToken) {
        res.status(401).json({ message: 'Refresh token is required.', code: 'REFRESH_TOKEN_MISSING' });
        return;
      }

      const newTokens = await AuthService.refreshToken(
        incomingRefreshToken,
        sessionMeta(req)
      );

      res.cookie('accessToken', newTokens.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie('refreshToken', newTokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        message: 'Tokens refreshed successfully',
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken
      });
    } catch (error) {
      if (isAppError(error)) {
        logger.warn({ code: error.code }, 'Refresh token rotation failed');
        res.status(403).json({ message: error.message, code: error.code });
        return;
      }

      next(error);
    }
  }

  // POST /logout
  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.id) {
        await AuthService.logout(req.user.id, req.user.isSuperAdmin);
      }

      res.clearCookie('accessToken', CLEAR_COOKIE_OPTIONS);
      res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
      res.clearCookie('superAdminToken', CLEAR_COOKIE_OPTIONS);

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}

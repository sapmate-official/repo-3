import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 2 * 24 * 60 * 60 * 1000, // 2 days
  path: '/',
  domain: env.NODE_ENV === 'production' ? '.alkaa.online' : undefined
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
  domain: env.NODE_ENV === 'production' ? '.alkaa.online' : undefined
};

export class AuthController {
  // POST /check-email
  static async checkEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const result = await AuthService.checkEmail(email);
      res.status(200).json(result);
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Check email failed');
      res.status(error.message.includes('not found') ? 404 : 400).json({
        message: error.message || 'Failed to check email'
      });
    }
  }

  // POST /verify-password & POST /login
  static async verifyPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, orgId } = req.body;
      const { response, tokens } = await AuthService.verifyPassword(email, password, orgId);

      if (tokens) {
        res.cookie('accessToken', tokens.accessToken, ACCESS_COOKIE_OPTIONS);
        res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
      }

      res.status(200).json(response);
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Password verification failed');
      res.status(401).json({
        message: error.message || 'Invalid credentials'
      });
    }
  }

  // POST /verify-otp
  static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, sessionToken, otpCode, orgId } = req.body;
      const { response, tokens } = await AuthService.verifyOtp({
        email,
        sessionToken,
        otpCode,
        orgId
      });

      res.cookie('accessToken', tokens.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json(response);
    } catch (error: any) {
      logger.warn({ error: error.message }, 'OTP verification failed');
      res.status(401).json({
        message: error.message || 'OTP verification failed'
      });
    }
  }

  // POST /set-password
  static async setPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { password, verificationToken } = req.body;
      const user = await AuthService.setPassword(password, verificationToken);
      res.status(200).json(user);
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Set password failed');
      res.status(400).json({
        message: error.message || 'Failed to set password'
      });
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
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Validate token failed');
      res.status(401).json({
        message: 'Token is invalid or user inactive',
        error: error.message
      });
    }
  }

  // POST /refresh-token
  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incomingRefreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
      if (!incomingRefreshToken) {
        res.status(401).json({ message: 'Refresh token is required.' });
        return;
      }

      const newTokens = await AuthService.refreshToken(incomingRefreshToken);

      res.cookie('accessToken', newTokens.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie('refreshToken', newTokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        message: 'Tokens refreshed successfully',
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken
      });
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Refresh token rotation failed');
      res.status(403).json({
        message: error.message || 'Invalid refresh token.'
      });
    }
  }

  // POST /logout
  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.id) {
        await AuthService.logout(req.user.id, req.user.isSuperAdmin);
      }

      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      res.clearCookie('superAdminToken', { path: '/' });

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Logout error');
      res.status(500).json({ message: 'Error during logout', error: error.message });
    }
  }
}

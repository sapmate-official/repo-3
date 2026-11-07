import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import {
  checkEmailSchema,
  verifyPasswordSchema,
  verifyOtpSchema,
  setPasswordSchema,
  refreshTokenSchema
} from './auth.schema.js';
import { refreshLimiter, logoutLimiter, authLimiter, otpLimiter, publicLimiter } from '../../middleware/rateLimit.js';
import { authenticateAny } from '../../middleware/auth.js';

export const authRouter = Router();

// Multi-tenant check email
authRouter.post(
  '/check-email',
  publicLimiter,
  validate({ body: checkEmailSchema }),
  AuthController.checkEmail
);

// Password verification (multi-tenant) & standard login
authRouter.post(
  '/verify-password',
  authLimiter,
  validate({ body: verifyPasswordSchema }),
  AuthController.verifyPassword
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: verifyPasswordSchema }),
  AuthController.verifyPassword
);

// OTP Verification
authRouter.post(
  '/verify-otp',
  otpLimiter,
  validate({ body: verifyOtpSchema }),
  AuthController.verifyOtp
);

// Secure Password Setup
authRouter.post(
  '/set-password',
  authLimiter,
  validate({ body: setPasswordSchema }),
  AuthController.setPassword
);

// Token validation
authRouter.get(
  '/validate-token',
  authenticateAny,
  AuthController.validateToken
);

// Token refresh
authRouter.post(
  '/refresh-token',
  refreshLimiter,
  validate({ body: refreshTokenSchema }),
  AuthController.refreshToken
);

// Logout
authRouter.post(
  '/logout',
  logoutLimiter,
  authenticateAny,
  AuthController.logout
);

export default authRouter;

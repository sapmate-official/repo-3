import { z } from 'zod';

export const checkEmailSchema = z.object({
  email: z.string().trim().email('Invalid email address')
});

export const verifyPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  orgId: z.string().optional()
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address').optional(),
  sessionToken: z.string().optional(),
  otpCode: z.string().min(4, 'OTP code is required'),
  orgId: z.string().optional()
});

export const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  verificationToken: z.string().min(8, 'A valid verification token is required')
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional()
});

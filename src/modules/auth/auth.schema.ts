import { z } from 'zod';

const emailSchema = z.string().trim().pipe(z.email('Invalid email address'));

export const checkEmailSchema = z.object({
  email: emailSchema
});

export const verifyPasswordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72, 'Password is too long'),
  orgId: z.string().optional()
});

export const verifyOtpSchema = z.object({
  email: emailSchema.optional(),
  sessionToken: z.string().optional(),
  otpCode: z.string().min(4, 'OTP code is required'),
  orgId: z.string().optional()
});

export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must be at most 72 characters long')
  .refine(
    (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
    'Password must contain at least one letter and one number'
  );

export const setPasswordSchema = z.object({
  password: strongPasswordSchema,
  verificationToken: z.string().min(8, 'A valid verification token is required')
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional()
});

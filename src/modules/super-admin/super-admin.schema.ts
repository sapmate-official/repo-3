import { z } from 'zod';

export const loginSuperAdminSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});

export const createSuperAdminSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  name: z.string().trim().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  secretKey: z.string().optional()
});

export const updateSuperAdminSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(6).optional()
});

export const generateOrganizationBillSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export const sendBillEmailSchema = z.object({
  billId: z.string().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional()
});

export const updateBillStatusSchema = z.object({
  status: z.enum(['PAID', 'UNPAID', 'OVERDUE', 'CANCELLED']),
  paymentReference: z.string().optional(),
  notes: z.string().optional()
});

export const processPaymentSchema = z.object({
  amount: z.coerce.number().optional(),
  paymentReference: z.string().optional(),
  notes: z.string().optional()
});

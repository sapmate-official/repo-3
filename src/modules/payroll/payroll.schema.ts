import { z } from 'zod';

export const createRunSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  notes: z.string().optional()
});

export const runOverrideSchema = z.object({
  lineItemId: z.string().min(1, 'Line item ID is required'),
  finalAmount: z.coerce.number().min(0, 'Final amount must be non-negative'),
  reason: z.string().min(3, 'Override reason is required for audit compliance')
});

export const rejectRunSchema = z.object({
  reason: z.string().min(3, 'Rejection reason is required')
});

export const disburseRunSchema = z.object({
  utr: z.string().optional(),
  notes: z.string().optional()
});

export const payrollQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['DRAFT', 'COMPUTING', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'DISBURSED', 'FAILED']).optional(),
  year: z.coerce.number().int().optional()
});

export type CreateRunInput = z.infer<typeof createRunSchema>;
export type RunOverrideInput = z.infer<typeof runOverrideSchema>;
export type RejectRunInput = z.infer<typeof rejectRunSchema>;
export type DisburseRunInput = z.infer<typeof disburseRunSchema>;
export type PayrollQueryInput = z.infer<typeof payrollQuerySchema>;

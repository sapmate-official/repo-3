import { z } from 'zod';

const flexibleBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return value;
}, z.boolean());

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

export const leaveTypeCreateSchema = z.object({
  orgId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  annualLimit: z.coerce.number().int().min(0).max(3660),
  requiresApproval: flexibleBoolean.optional().default(true),
  isPaid: flexibleBoolean.optional().default(true),
  carryForward: flexibleBoolean.optional().default(false),
  maxCarryForward: z.coerce.number().int().min(0).max(3660).optional().default(0)
});

export const leaveTypeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  annualLimit: z.coerce.number().int().min(0).max(3660).optional(),
  requiresApproval: flexibleBoolean.optional(),
  isPaid: flexibleBoolean.optional(),
  carryForward: flexibleBoolean.optional(),
  maxCarryForward: z.coerce.number().int().min(0).max(3660).optional()
});

export const leaveRequestCreateSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  leaveTypeId: z.string().trim().min(1),
  startDate: dateOnly,
  endDate: dateOnly,
  reason: z.string().trim().min(1).max(2000),
  attachments: z.unknown().optional()
});

export const leaveRequestUpdateSchema = z.object({
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  attachments: z.unknown().optional()
});

export const leaveRejectSchema = z.object({
  approvedBy: z.string().trim().min(1).optional(),
  rejectedReason: z.string().trim().min(1).max(2000)
});

export const leaveApproveSchema = z.object({
  approvedBy: z.string().trim().min(1).optional()
});

export const leaveBalanceCreateSchema = z.object({
  userId: z.string().trim().min(1),
  leaveTypeId: z.string().trim().min(1),
  usedDays: z.coerce.number().int().min(0).optional().default(0),
  remainingDays: z.coerce.number().int().min(0),
  year: z.coerce.number().int().min(2000).max(2200),
  carryForward: z.coerce.number().int().min(0).optional().default(0)
});

export const leaveBalanceUpdateSchema = z.object({
  usedDays: z.coerce.number().int().min(0).optional(),
  remainingDays: z.coerce.number().int().min(0).optional(),
  carryForward: z.coerce.number().int().min(0).optional()
});

export type LeaveTypeCreateInput = z.infer<typeof leaveTypeCreateSchema>;
export type LeaveTypeUpdateInput = z.infer<typeof leaveTypeUpdateSchema>;
export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>;
export type LeaveRequestUpdateInput = z.infer<typeof leaveRequestUpdateSchema>;
export type LeaveApproveInput = z.infer<typeof leaveApproveSchema>;
export type LeaveRejectInput = z.infer<typeof leaveRejectSchema>;
export type LeaveBalanceCreateInput = z.infer<typeof leaveBalanceCreateSchema>;
export type LeaveBalanceUpdateInput = z.infer<typeof leaveBalanceUpdateSchema>;

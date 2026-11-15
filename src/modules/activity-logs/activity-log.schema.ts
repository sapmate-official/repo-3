import { z } from 'zod';

export const activityLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  userId: z.string().optional(),
  actorId: z.string().optional(),
  targetUserId: z.string().optional(),
  targetId: z.string().optional(),
  entity: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

export const activityStatsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('7d')
});

export const userRecentQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export const userRecentParamsSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required')
});

export type ActivityLogQueryInput = z.infer<typeof activityLogQuerySchema>;
export type ActivityStatsQueryInput = z.infer<typeof activityStatsQuerySchema>;
export type UserRecentQueryInput = z.infer<typeof userRecentQuerySchema>;

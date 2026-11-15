import { z } from 'zod';

export const createSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required'),
  description: z.string().trim().optional(),
  monthlyPrice: z.coerce.number().min(0, 'Monthly price must be a non-negative number'),
  annualPrice: z.coerce.number().min(0, 'Annual price must be a non-negative number'),
  maxUsers: z.coerce.number().int().min(1, 'Max users must be at least 1').default(100),
  features: z.unknown().optional(),
  isActive: z.boolean().optional().default(true)
});

export const updateSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  monthlyPrice: z.coerce.number().min(0).optional(),
  annualPrice: z.coerce.number().min(0).optional(),
  maxUsers: z.coerce.number().int().min(1).optional(),
  features: z.unknown().optional(),
  isActive: z.boolean().optional()
});

export const planIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Plan ID is required')
});

export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;
export type UpdateSubscriptionPlanInput = z.infer<typeof updateSubscriptionPlanSchema>;

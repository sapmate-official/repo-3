import { z } from 'zod';

export const orgIdParamsSchema = z.object({
  orgId: z.string().trim().min(1, 'Organization id is required').max(64)
});

export const adminParamsSchema = z.object({
  orgId: z.string().trim().min(1, 'Organization id is required').max(64),
  adminId: z.string().trim().min(1, 'Admin user id is required').max(64)
});

const organizationFields = {
  name: z.string().trim().min(1, 'Organization name is required').max(120),
  industry: z.string().trim().max(120).nullable().optional(),
  logo: z.string().trim().max(2048).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  subscriptionStart: z.coerce.date().optional(),
  subscriptionEnd: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  subscriptionPlanId: z.string().trim().min(1).nullable().optional()
};

export const createOrganizationSchema = z.object(organizationFields);

export const updateOrganizationSchema = z
  .object(organizationFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided'
  });

export const listOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  isActive: z.preprocess(
    (value) => (value === 'true' ? true : value === 'false' ? false : value),
    z.boolean().optional()
  )
});

export const setOrgAdminSchema = z.object({
  userId: z.string().trim().min(1, 'User id is required').max(64)
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;
export type SetOrgAdminInput = z.infer<typeof setOrgAdminSchema>;

import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(100),
  description: z.string().trim().max(500).optional(),
  code: z.string().trim().toUpperCase().max(20).optional(),
  headId: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  budget: z.number().nonnegative('Budget must be positive or zero').optional().nullable(),
  status: z.boolean().optional().default(true),
  orgId: z.string().trim().optional()
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const departmentIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Department ID is required')
});

export const departmentHeadParamSchema = z.object({
  id: z.string().trim().min(1, 'Department ID is required'),
  userId: z.string().trim().min(1, 'User ID is required')
});

export const departmentOrgParamSchema = z.object({
  orgId: z.string().trim().min(1, 'Organization ID is required')
});

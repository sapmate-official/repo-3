import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  orgId: z.string().optional(),
  permissions: z.array(z.any()).optional()
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  permissions: z.array(z.any()).optional()
});

export const roleIdParamSchema = z.object({
  id: z.string().optional(),
  roleId: z.string().optional()
});

export const roleOrgParamSchema = z.object({
  orgId: z.string()
});

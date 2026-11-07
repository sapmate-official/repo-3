import { z } from 'zod';

const permissionInputSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    permissionId: z.string().optional()
  })
]);

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  orgId: z.string().optional(),
  permissions: z.array(permissionInputSchema).optional()
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  permissions: z.array(permissionInputSchema).optional()
});

export const roleIdParamSchema = z.object({
  id: z.string().optional(),
  roleId: z.string().optional()
});

export const roleOrgParamSchema = z.object({
  orgId: z.string()
});

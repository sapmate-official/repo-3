import { z } from 'zod';

export const createPresetSchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(1, 'Preset name is required'),
  description: z.string().optional(),
  permissions: z.unknown().default([])
});

export const updatePresetSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  permissions: z.unknown().optional()
});

export type CreatePresetInput = z.infer<typeof createPresetSchema>;
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;

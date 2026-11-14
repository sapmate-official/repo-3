import { z } from 'zod';

export const holidayIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Holiday ID is required')
});

export const holidayTypeIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Holiday Type ID is required')
});

export const orgIdParamSchema = z.object({
  orgId: z.string().trim().min(1, 'Organization ID is required')
});

export const createHolidaySchema = z.object({
  name: z.string().trim().min(1, 'Holiday name is required').max(100),
  date: z.coerce.date(),
  description: z.string().trim().max(500).optional().nullable(),
  isOptional: z.boolean().optional().default(false),
  type: z.string().trim().min(1).optional().nullable(),
  orgId: z.string().trim().min(1).optional()
});

export const updateHolidaySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  date: z.coerce.date().optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isOptional: z.boolean().optional(),
  type: z.string().trim().min(1).optional().nullable()
});

export const listHolidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  type: z.string().trim().optional(),
  isOptional: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(100),
  page: z.coerce.number().int().positive().optional().default(1)
});

export const holidayCalendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional()
});

export const upcomingHolidaysQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional().default(5)
});

export const bulkCreateHolidaySchema = z.object({
  holidays: z.array(createHolidaySchema).min(1, 'At least one holiday is required').max(100)
});

export const toggleHolidaySchema = z.object({
  isActive: z.boolean()
});

// Holiday Type schemas
export const createHolidayTypeSchema = z.object({
  name: z.string().trim().min(1, 'Holiday type name is required').max(100),
  policy: z.string().trim().max(1000).optional().nullable(),
  orgId: z.string().trim().min(1).optional()
});

export const updateHolidayTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  policy: z.string().trim().max(1000).optional().nullable()
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type ListHolidaysQuery = z.infer<typeof listHolidaysQuerySchema>;
export type HolidayCalendarQuery = z.infer<typeof holidayCalendarQuerySchema>;
export type UpcomingHolidaysQuery = z.infer<typeof upcomingHolidaysQuerySchema>;
export type BulkCreateHolidayInput = z.infer<typeof bulkCreateHolidaySchema>;
export type CreateHolidayTypeInput = z.infer<typeof createHolidayTypeSchema>;
export type UpdateHolidayTypeInput = z.infer<typeof updateHolidayTypeSchema>;

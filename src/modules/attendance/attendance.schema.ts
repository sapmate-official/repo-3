import { z } from 'zod';

export const locationSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  accuracy: z.number().optional()
}).passthrough();

export const checkInSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  checkInTime: z.string().min(1, 'Check-in time is required'),
  checkInLocation: locationSchema.or(z.record(z.string(), z.unknown())),
  notes: z.string().trim().max(1000).optional().nullable(),
  clientTimestamp: z.string().optional(),
  clientTimezone: z.string().optional()
});

export const checkOutSchema = z.object({
  checkInId: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  checkOutTime: z.string().min(1, 'Check-out time is required'),
  checkOutLocation: locationSchema.or(z.record(z.string(), z.unknown())),
  notes: z.string().trim().max(1000).optional().nullable(),
  reportContent: z.unknown().optional(),
  clientTimestamp: z.string().optional(),
  clientTimezone: z.string().optional()
});

export const pastCheckOutSchema = z.object({
  attendanceId: z.string().min(1, 'Attendance ID is required'),
  checkOutTime: z.string().min(1, 'Check-out time is required'),
  notes: z.string().trim().max(1000).optional().nullable(),
  clientTimestamp: z.string().optional(),
  clientTimezone: z.string().optional()
});

export const pastAttendanceSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  checkInTime: z.string().min(1, 'Check-in time is required'),
  checkOutTime: z.string().min(1, 'Check-out time is required'),
  checkInLocation: locationSchema.or(z.record(z.string(), z.unknown())).optional().default({}),
  checkOutLocation: locationSchema.or(z.record(z.string(), z.unknown())).optional().default({}),
  notes: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable()
});

export const verifyAttendanceSchema = z.object({
  attendanceId: z.string().optional(),
  userId: z.string().optional(),
  verificationStatus: z.enum(['VERIFIED', 'REJECTED', 'UNVERIFIED']).optional(),
  action: z.enum(['approve', 'reject', 'VERIFIED', 'REJECTED']).optional(),
  remarks: z.string().trim().max(1000).optional()
});

export const attendanceFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  date: z.string().optional(),
  userId: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'EARLY_DEPARTURE']).optional(),
  verificationStatus: z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']).optional()
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type PastCheckOutInput = z.infer<typeof pastCheckOutSchema>;
export type PastAttendanceInput = z.infer<typeof pastAttendanceSchema>;
export type VerifyAttendanceInput = z.infer<typeof verifyAttendanceSchema>;
export type AttendanceFilterInput = z.infer<typeof attendanceFilterSchema>;

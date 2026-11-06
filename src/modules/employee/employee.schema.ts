import { z } from 'zod';

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  roleId: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortBy: z.enum(['createdAt', 'hiredDate', 'firstName', 'lastName', 'employeeId', 'annualPackage', 'monthlySalary']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  orgId: z.string().trim().optional()
});

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  email: z.string().trim().email('Valid email is required'),
  personalEmail: z.string().trim().email().optional().nullable(),
  businessEmail: z.string().trim().email().optional().nullable(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  mobileNumber: z.string().trim().max(20).optional().nullable(),
  emergencyContact: z.string().trim().max(50).optional().nullable(),
  dateOfBirth: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  hiredDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  adharNumber: z.string().trim().max(30).optional().nullable(),
  panNumber: z.string().trim().max(30).optional().nullable(),
  employeeId: z.string().trim().min(1, 'Employee ID is required'),
  departmentId: z.string().trim().optional().nullable(),
  managerId: z.string().trim().optional().nullable(),
  roleIds: z.array(z.string().trim()).min(1, 'At least one role ID is required'),
  orgId: z.string().trim().optional(),
  // Bank details
  accountHolder: z.string().trim().max(150).optional().nullable(),
  accountNumber: z.string().trim().max(50).optional().nullable(),
  ifscCode: z.string().trim().max(20).optional().nullable(),
  bankName: z.string().trim().max(100).optional().nullable(),
  // Salary details
  annualPackage: z.coerce.number().nonnegative().optional().nullable(),
  monthlySalary: z.coerce.number().nonnegative().optional().nullable(),
  hraPercentage: z.coerce.number().min(0).max(100).optional().default(40),
  daPercentage: z.coerce.number().min(0).max(100).optional().default(10),
  taPercentage: z.coerce.number().min(0).max(100).optional().default(10),
  pfPercentage: z.coerce.number().min(0).max(100).optional().default(12),
  taxPercentage: z.coerce.number().min(0).max(100).optional().default(10),
  insuranceFixed: z.coerce.number().nonnegative().optional().default(1000)
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
  terminationDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable()
});

export const employeeIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Employee ID is required')
});

export const checkEmployeeIdParamSchema = z.object({
  orgId: z.string().trim().min(1, 'Organization ID is required'),
  employeeId: z.string().trim().min(1, 'Employee ID is required')
});

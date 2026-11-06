import { z } from 'zod';

export const createCandidateSchema = z.object({
  email: z.string().trim().email('Valid personal email is required'),
  personalEmail: z.string().trim().email().optional().nullable(),
  businessEmail: z.string().trim().email().optional().nullable(),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  mobileNumber: z.string().trim().max(20).optional().nullable(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  departmentId: z.string().trim().optional().nullable(),
  managerId: z.string().trim().optional().nullable(),
  annualPackage: z.coerce.number().nonnegative().optional().nullable(),
  monthlySalary: z.coerce.number().nonnegative().optional().nullable(),
  hiredDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  orgId: z.string().trim().optional()
});

export const submitCandidateFormSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().optional(),
  mobileNumber: z.string().trim().optional(),
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  emergencyContact: z.string().trim().optional().nullable(),
  panNumber: z.string().trim().optional().nullable(),
  adharNumber: z.string().trim().optional().nullable(),
  jobTitle: z.string().trim().optional().nullable(),
  bankDetails: z
    .object({
      accountHolderName: z.string().trim().optional(),
      accountNumber: z.string().trim().optional(),
      ifscCode: z.string().trim().optional(),
      bankName: z.string().trim().optional()
    })
    .optional(),
  documents: z.record(z.string(), z.any()).optional()
}).passthrough();

export const verifyDocumentSchema = z.object({
  documentKey: z.string().trim().min(1, 'Document key is required'),
  status: z.enum(['VERIFIED', 'REJECTED']),
  feedback: z.string().trim().max(500).optional()
});

export const rejectCandidateSchema = z.object({
  reason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters')
});

export const approveCandidateSchema = z.object({
  roleId: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  managerId: z.string().trim().optional(),
  annualPackage: z.coerce.number().nonnegative().optional(),
  monthlySalary: z.coerce.number().nonnegative().optional()
}).passthrough();

export const completeOnboardingSchema = z.object({
  roleId: z.string().trim().min(1, 'Role ID is required to provision employee'),
  departmentId: z.string().trim().optional().nullable(),
  managerId: z.string().trim().optional().nullable(),
  businessEmail: z.string().trim().email().optional().nullable(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  annualPackage: z.coerce.number().nonnegative().optional().nullable(),
  monthlySalary: z.coerce.number().nonnegative().optional().nullable()
});

export const candidateIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Candidate ID is required')
});

export const candidateTokenParamSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required')
});

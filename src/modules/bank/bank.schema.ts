import { z } from 'zod';

export const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const accountNumberRegex = /^\d{9,18}$/;

export const userIdParamSchema = z.object({
  userId: z.string().trim().min(1, 'User ID is required')
});

export const bankUserOrIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID or User ID is required')
});

export const createBankDetailsSchema = z.object({
  userId: z.string().trim().min(1, 'User ID is required'),
  accountHolder: z.string().trim().min(1, 'Account holder name is required').max(100),
  accountNumber: z
    .string()
    .trim()
    .regex(accountNumberRegex, 'Valid account number is required (9-18 digits)'),
  ifscCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => ifscRegex.test(v), {
      message: 'Valid IFSC code is required (format: 4 letters, 0, 6 letters or digits, e.g. SBIN0001234)'
    }),
  bankName: z.string().trim().min(1, 'Bank name is required').max(100)
});

export const updateBankDetailsSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  accountHolder: z.string().trim().min(1, 'Account holder name cannot be empty').max(100).optional(),
  accountNumber: z
    .string()
    .trim()
    .regex(accountNumberRegex, 'Valid account number is required (9-18 digits)')
    .optional(),
  ifscCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => ifscRegex.test(v), {
      message: 'Valid IFSC code is required (format: 4 letters, 0, 6 letters or digits, e.g. SBIN0001234)'
    })
    .optional(),
  bankName: z.string().trim().min(1, 'Bank name cannot be empty').max(100).optional()
});

export const upsertBankDetailsSchema = z.object({
  userId: z.string().trim().min(1, 'User ID is required'),
  accountHolder: z.string().trim().min(1, 'Account holder name is required').max(100),
  accountNumber: z
    .string()
    .trim()
    .regex(accountNumberRegex, 'Valid account number is required (9-18 digits)'),
  ifscCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => ifscRegex.test(v), {
      message: 'Valid IFSC code is required (format: 4 letters, 0, 6 letters or digits, e.g. SBIN0001234)'
    }),
  bankName: z.string().trim().min(1, 'Bank name is required').max(100)
});

export const deleteBankDetailsBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional()
});

export const listBankDetailsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  search: z.string().trim().optional()
});

export type CreateBankDetailsInput = z.infer<typeof createBankDetailsSchema>;
export type UpdateBankDetailsInput = z.infer<typeof updateBankDetailsSchema>;
export type UpsertBankDetailsInput = z.infer<typeof upsertBankDetailsSchema>;
export type ListBankDetailsQuery = z.infer<typeof listBankDetailsQuerySchema>;

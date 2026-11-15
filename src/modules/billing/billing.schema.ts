import { z } from 'zod';

export const billHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'UNPAID']).optional(),
  year: z.coerce.number().int().optional(),
  sort: z.enum(['asc', 'desc']).default('desc')
});

export const payBillSchema = z.object({
  paymentMethod: z.string().min(1, 'Payment method is required'),
  paymentReference: z.string().optional()
});

export type BillHistoryQueryInput = z.infer<typeof billHistoryQuerySchema>;
export type PayBillInput = z.infer<typeof payBillSchema>;

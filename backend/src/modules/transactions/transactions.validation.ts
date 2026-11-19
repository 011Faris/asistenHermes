import { z } from 'zod';

export const transactionTypeEnum = z.enum(['income', 'expense', 'transfer']);
export const transactionStatusEnum = z.enum(['pending', 'confirmed', 'cancelled']);

export const idParamSchema = z.object({
  id: z.string().uuid('ID harus berupa UUID'),
});

export const listTransactionsQuerySchema = z.object({
  start_date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  end_date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  type: transactionTypeEnum.optional(),
  status: transactionStatusEnum.optional(),
  wallet_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const baseMoneySchema = z.object({
  amount: z.number().int('Nominal harus bilangan bulat').positive('Nominal harus lebih dari nol'),
  description: z.string().trim().min(1, 'Deskripsi wajib diisi').max(500),
  transaction_date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().trim().max(1000).nullish(),
});

export const createIncomeSchema = baseMoneySchema.extend({
  wallet_id: z.string().uuid('Dompet tujuan tidak valid'),
  category_id: z.string().uuid('Kategori tidak valid'),
});

export const createExpenseSchema = baseMoneySchema.extend({
  wallet_id: z.string().uuid('Dompet sumber tidak valid'),
  category_id: z.string().uuid('Kategori tidak valid'),
});

export const createTransferSchema = baseMoneySchema.extend({
  source_wallet_id: z.string().uuid('Dompet asal tidak valid'),
  destination_wallet_id: z.string().uuid('Dompet tujuan tidak valid'),
});

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

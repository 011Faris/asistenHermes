import { z } from 'zod';

export const walletTypeEnum = z.enum(['cash', 'bank', 'e_wallet', 'other']);

export const idParamSchema = z.object({
  id: z.string().uuid('ID harus berupa UUID'),
});

export const createWalletSchema = z.object({
  name: z.string().trim().min(1, 'Nama dompet wajib diisi').max(100),
  wallet_type: walletTypeEnum,
  provider: z.string().trim().max(100).nullish(),
  account_number: z.string().trim().max(50).nullish(),
  initial_balance: z.number().int('Saldo awal harus bilangan bulat').min(0, 'Saldo awal tidak boleh negatif').default(0),
  description: z.string().trim().max(500).nullish(),
  is_active: z.boolean().default(true),
});

export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    wallet_type: walletTypeEnum.optional(),
    provider: z.string().trim().max(100).nullable().optional(),
    account_number: z.string().trim().max(50).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    initial_balance: z
      .number()
      .int('Saldo awal harus bilangan bulat')
      .min(0, 'Saldo awal tidak boleh negatif')
      .max(Number.MAX_SAFE_INTEGER, 'Saldo awal melebihi batas aman')
      .optional(),
  })
  // Tolak field tak dikenal agar tidak terjadi sukses palsu (kasus initial_balance),
  // dan tolak body kosong agar PATCH tanpa perubahan tidak lolos diam-diam.
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: 'Body tidak boleh kosong; sertakan minimal satu field yang diubah',
  });

export const updateWalletStatusSchema = z.object({
  is_active: z.boolean(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;

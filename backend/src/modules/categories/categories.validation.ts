import { z } from 'zod';

export const categoryTypeEnum = z.enum(['income', 'expense']);

export const idParamSchema = z.object({
  id: z.string().uuid('ID harus berupa UUID'),
});

export const listCategoriesQuerySchema = z.object({
  category_type: categoryTypeEnum.optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(100),
  category_type: categoryTypeEnum,
  description: z.string().trim().max(500).nullish(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

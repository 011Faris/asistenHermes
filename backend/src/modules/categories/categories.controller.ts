import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory,
} from './categories.service.js';

export async function listCategoriesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listCategories(getSupabase(), {
      categoryType: req.query.category_type as 'income' | 'expense' | undefined,
    });
    return sendSuccess(res, data, 'Daftar kategori berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function getCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getCategoryById(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Kategori berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function createCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createCategory(getSupabase(), req.body);
    return sendSuccess(res, data, 'Kategori berhasil dibuat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function updateCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await updateCategory(getSupabase(), req.params.id, req.body);
    return sendSuccess(res, data, 'Kategori berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

export async function deleteCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await deleteCategory(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Kategori berhasil dihapus');
  } catch (err) {
    return next(err);
  }
}

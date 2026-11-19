import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation.js';

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

export type CategoryType = 'income' | 'expense';

export async function listCategories(db: SupabaseClient, opts: { categoryType?: CategoryType }) {
  // Kolom aktual: category_type (bukan "type"), tanpa is_active.
  let query = db.from('categories').select('*').order('name', { ascending: true });
  if (opts.categoryType) query = query.eq('category_type', opts.categoryType);
  const { data, error } = await query;
  if (error) mapDbError(error);
  return data ?? [];
}

export async function getCategoryById(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('categories').select('*').eq('id', id).maybeSingle();
  if (error) mapDbError(error);
  if (!data) throw Errors.notFound('Kategori tidak ditemukan');
  return data as Record<string, unknown> & { id: string; category_type: string };
}

export async function createCategory(db: SupabaseClient, input: CreateCategoryInput) {
  const { data, error } = await db.from('categories').insert(input).select('*').single();
  if (error) mapDbError(error);
  return data;
}

export async function updateCategory(db: SupabaseClient, id: string, input: UpdateCategoryInput) {
  await getCategoryById(db, id);
  // Tabel categories tidak memiliki updated_at — kirim patch apa adanya.
  const { data, error } = await db
    .from('categories')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) mapDbError(error);
  return data;
}

export async function deleteCategory(db: SupabaseClient, id: string) {
  await getCategoryById(db, id);
  // Kategori yang sudah dipakai transaksi tidak boleh dihapus sembarangan.
  const { count, error: countError } = await db
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (countError) mapDbError(countError);
  if ((count ?? 0) > 0) {
    throw Errors.conflict('Kategori sudah digunakan transaksi dan tidak dapat dihapus.');
  }
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) mapDbError(error);
  return { id };
}

/** Pastikan kategori bertipe sesuai dengan jenis transaksi. */
export async function assertCategoryType(db: SupabaseClient, id: string, expected: 'income' | 'expense') {
  const category = await getCategoryById(db, id);
  if (category.category_type !== expected) {
    throw Errors.badRequest(`Kategori tidak sesuai: transaksi ${expected} membutuhkan kategori ${expected}`);
  }
  return category;
}

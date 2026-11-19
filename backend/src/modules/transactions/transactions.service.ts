import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import { assertCategoryType } from '../categories/categories.service.js';
import { assertWalletUsable } from '../wallets/wallets.service.js';
import type {
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  ListTransactionsQuery,
} from './transactions.validation.js';

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

function toIsoDate(input: string): string {
  // Terima YYYY-MM-DD atau ISO datetime; normalisasi ke ISO untuk TIMESTAMPTZ.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00+07:00`).toISOString();
  return new Date(input).toISOString();
}

/**
 * Kontrak API memakai properti `type` / `amount`, sedangkan kolom database
 * aktual adalah `transaction_type` / `amount_signed`.
 * Translasi DB -> API dipusatkan pada dua fungsi ini.
 */
export function toApiTransaction(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, type: row.transaction_type };
}

export function toApiEntry(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, amount: row.amount_signed };
}

export async function listTransactions(db: SupabaseClient, q: ListTransactionsQuery) {
  const offset = (q.page - 1) * q.limit;
  // Cari entri via transactions; filter wallet melibatkan transaction_entries.
  let walletTxIds: string[] | null = null;
  if (q.wallet_id) {
    const { data: entries, error: entriesError } = await db
      .from('transaction_entries')
      .select('transaction_id')
      .eq('wallet_id', q.wallet_id);
    if (entriesError) mapDbError(entriesError);
    walletTxIds = (entries ?? []).map((e) => (e as { transaction_id: string }).transaction_id);
    if (walletTxIds.length === 0) {
      return { items: [], page: q.page, limit: q.limit, total: 0 };
    }
  }

  let query = db.from('transactions').select('*', { count: 'exact' }).order('transaction_date', { ascending: false });
  // Query param API tetap `type`; kolom DB aktual `transaction_type`.
  if (q.type) query = query.eq('transaction_type', q.type);
  if (q.status) query = query.eq('status', q.status);
  if (q.category_id) query = query.eq('category_id', q.category_id);
  if (q.start_date) query = query.gte('transaction_date', toIsoDate(q.start_date));
  if (q.end_date) query = query.lte('transaction_date', toIsoDate(q.end_date));
  if (walletTxIds) query = query.in('id', walletTxIds);
  if (q.search) query = query.ilike('description', `%${q.search}%`);

  const { data, error, count } = await query.range(offset, offset + q.limit - 1);
  if (error) mapDbError(error);
  const items = ((data ?? []) as Array<Record<string, unknown>>).map(toApiTransaction);
  return { items, page: q.page, limit: q.limit, total: count ?? 0 };
}

export async function getTransactionDetail(db: SupabaseClient, id: string) {
  const { data: tx, error } = await db.from('transactions').select('*').eq('id', id).maybeSingle();
  if (error) mapDbError(error);
  if (!tx) throw Errors.notFound('Transaksi tidak ditemukan');
  const { data: entries, error: entriesError } = await db
    .from('transaction_entries')
    .select('*')
    .eq('transaction_id', id);
  if (entriesError) mapDbError(entriesError);
  const apiEntries = ((entries ?? []) as Array<Record<string, unknown>>).map(toApiEntry);
  return { ...toApiTransaction(tx as Record<string, unknown>), entries: apiEntries };
}

export async function createIncome(db: SupabaseClient, input: CreateIncomeInput) {
  await assertWalletUsable(db, input.wallet_id, 'Dompet tujuan');
  await assertCategoryType(db, input.category_id, 'income');
  // Wajib via DB function agar jurnal selalu konsisten; jangan insert entries manual.
  const { data, error } = await db.rpc('create_simple_transaction', {
    p_type: 'income',
    p_wallet_id: input.wallet_id,
    p_amount: input.amount,
    p_description: input.description,
    p_category_id: input.category_id,
    p_transaction_date: toIsoDate(input.transaction_date),
    p_notes: input.notes ?? null,
  });
  if (error) mapDbError(error);
  return data;
}

export async function createExpense(db: SupabaseClient, input: CreateExpenseInput) {
  await assertWalletUsable(db, input.wallet_id, 'Dompet sumber');
  await assertCategoryType(db, input.category_id, 'expense');
  const { data, error } = await db.rpc('create_simple_transaction', {
    p_type: 'expense',
    p_wallet_id: input.wallet_id,
    p_amount: input.amount,
    p_description: input.description,
    p_category_id: input.category_id,
    p_transaction_date: toIsoDate(input.transaction_date),
    p_notes: input.notes ?? null,
  });
  if (error) mapDbError(error);
  return data;
}

export async function createTransfer(db: SupabaseClient, input: CreateTransferInput) {
  if (input.source_wallet_id === input.destination_wallet_id) {
    throw Errors.badRequest('Dompet asal dan tujuan tidak boleh sama');
  }
  await assertWalletUsable(db, input.source_wallet_id, 'Dompet asal');
  await assertWalletUsable(db, input.destination_wallet_id, 'Dompet tujuan');
  // Wajib via DB function agar transfer atomik; jangan buat dua entries manual.
  const { data, error } = await db.rpc('create_transfer', {
    p_source_wallet_id: input.source_wallet_id,
    p_destination_wallet_id: input.destination_wallet_id,
    p_amount: input.amount,
    p_description: input.description,
    p_transaction_date: toIsoDate(input.transaction_date),
    p_notes: input.notes ?? null,
  });
  if (error) mapDbError(error);
  return data;
}

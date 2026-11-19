import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { Errors } from '../../utils/errors.js';
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

/**
 * Idempotensi tulis transaksi.
 * - Kunci (`Idempotency-Key`, UUID, wajib) diterima via HTTP header dan
 *   diteruskan apa adanya ke RPC sebagai `p_idempotency_key`.
 * - Sidik (`p_request_hash`) = SHA-256 (modul bawaan `node:crypto`, tanpa
 *   dependensi baru) atas payload kanonis: nilai pasca-Zod yang SAMA dengan
 *   argumen RPC (tanggal via toIsoDate, notes null bila kosong, UUID
 *   lowercase, description sudah di-trim oleh Zod). Urutan field disortir
 *   agar byte-identik antar percobaan.
 */
function canonicalJson(canonical: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(canonical).sort()) sorted[key] = canonical[key];
  return JSON.stringify(sorted);
}

function hashPayload(canonical: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(canonical), 'utf8').digest('hex');
}

/**
 * Konflik idempotensi hanya dipetakan dari penanda terverifikasi definisi RPC:
 * SQLSTATE P0001 DAN pesan persis 'Idempotency key sudah digunakan untuk
 * permintaan berbeda'. P0001 lain, 23505, atau pesan berbeda BUKAN konflik.
 */
function isIdempotencyConflict(err: { code?: string; message?: string }): boolean {
  return (
    err.code === 'P0001' && err.message === 'Idempotency key sudah digunakan untuk permintaan berbeda'
  );
}

function mapWriteError(err: { message: string; code?: string; details?: unknown; hint?: unknown }): never {
  if (isIdempotencyConflict(err)) {
    throw Errors.conflict(
      'Idempotency-Key ini sudah dipakai untuk transaksi yang berbeda. Gunakan kunci baru untuk transaksi baru.',
      { code: err.code },
    );
  }
  // 422 (saldo tidak mencukupi) dan error DB lain tetap 502: tidak ada penanda
  // sempit yang terverifikasi dari definisi RPC. Bukan tebakan.
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
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

export async function createIncome(db: SupabaseClient, input: CreateIncomeInput, idempotencyKey: string) {
  // Tanpa pre-check dompet/kategori di sini: replay (key+payload sama) wajib
  // lolos meski status berubah, dan validasi transaksi baru tetap dilakukan
  // oleh RPC lama di dalam RPC idempotent. Validasi Zod tetap di routes.
  // Wajib via DB function agar jurnal selalu konsisten; jangan insert entries manual.
  // Payload ternormalisasi dipakai SAMA untuk hash dan argumen RPC.
  const transactionDate = toIsoDate(input.transaction_date);
  const notes = input.notes ?? null;
  const requestHash = hashPayload({
    type: 'income',
    wallet_id: input.wallet_id.toLowerCase(),
    category_id: input.category_id.toLowerCase(),
    amount: input.amount,
    description: input.description,
    transaction_date: transactionDate,
    notes,
  });
  const { data, error } = await db.rpc('create_simple_transaction_idempotent', {
    p_type: 'income',
    p_wallet_id: input.wallet_id,
    p_amount: input.amount,
    p_description: input.description,
    p_category_id: input.category_id,
    p_transaction_date: transactionDate,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error) mapWriteError(error);
  return data;
}

export async function createExpense(db: SupabaseClient, input: CreateExpenseInput, idempotencyKey: string) {
  // Tanpa pre-check dompet/kategori di sini: alasan sama seperti createIncome.
  // Payload ternormalisasi dipakai SAMA untuk hash dan argumen RPC.
  const transactionDate = toIsoDate(input.transaction_date);
  const notes = input.notes ?? null;
  const requestHash = hashPayload({
    type: 'expense',
    wallet_id: input.wallet_id.toLowerCase(),
    category_id: input.category_id.toLowerCase(),
    amount: input.amount,
    description: input.description,
    transaction_date: transactionDate,
    notes,
  });
  const { data, error } = await db.rpc('create_simple_transaction_idempotent', {
    p_type: 'expense',
    p_wallet_id: input.wallet_id,
    p_amount: input.amount,
    p_description: input.description,
    p_category_id: input.category_id,
    p_transaction_date: transactionDate,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error) mapWriteError(error);
  return data;
}

export async function createTransfer(db: SupabaseClient, input: CreateTransferInput, idempotencyKey: string) {
  if (input.source_wallet_id === input.destination_wallet_id) {
    throw Errors.badRequest('Dompet asal dan tujuan tidak boleh sama');
  }
  // Tanpa pre-check dompet di sini: alasan sama seperti createIncome.
  // Pemeriksaan dompet sama vs tujuan di atas dipertahankan (validasi input murni).
  // Wajib via DB function agar transfer atomik; jangan buat dua entries manual.
  // Payload ternormalisasi dipakai SAMA untuk hash dan argumen RPC.
  const transactionDate = toIsoDate(input.transaction_date);
  const notes = input.notes ?? null;
  const requestHash = hashPayload({
    type: 'transfer',
    source_wallet_id: input.source_wallet_id.toLowerCase(),
    destination_wallet_id: input.destination_wallet_id.toLowerCase(),
    amount: input.amount,
    description: input.description,
    transaction_date: transactionDate,
    notes,
  });
  const { data, error } = await db.rpc('create_transfer_idempotent', {
    p_source_wallet_id: input.source_wallet_id,
    p_destination_wallet_id: input.destination_wallet_id,
    p_amount: input.amount,
    p_description: input.description,
    p_transaction_date: transactionDate,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error) mapWriteError(error);
  return data;
}

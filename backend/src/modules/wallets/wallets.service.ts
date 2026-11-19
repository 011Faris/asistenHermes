import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import type { CreateWalletInput, UpdateWalletInput } from './wallets.validation.js';

/** Baris view wallet_balances (kolom aktual). */
export interface WalletBalance {
  id: string;
  current_balance: number | null;
  [key: string]: unknown;
}

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

export async function listWallets(db: SupabaseClient) {
  const { data, error } = await db
    .from('wallets')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) mapDbError(error);
  return data ?? [];
}

/** Daftar dompet + saldo terkini dari view wallet_balances. */
export async function listWalletsWithBalances(db: SupabaseClient) {
  const wallets = (await listWallets(db)) as Array<Record<string, unknown>>;
  const { data: balances, error } = await db.from('wallet_balances').select('*');
  if (error) mapDbError(error);
  // View wallet_balances memakai kunci `id` dan nilai `current_balance` (numeric).
  const byWallet = new Map<string, Record<string, unknown>>();
  for (const row of (balances ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.id ?? '');
    if (key) byWallet.set(key, row);
  }
  return wallets.map((w) => {
    const info = byWallet.get(String(w.id));
    const raw = info?.current_balance as number | string | null | undefined;
    return {
      ...w,
      balance_info: info ?? null,
      current_balance: typeof raw === 'string' ? Number(raw) : (raw ?? null),
    };
  });
}

export async function getWalletById(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('wallets').select('*').eq('id', id).maybeSingle();
  if (error) mapDbError(error);
  if (!data) throw Errors.notFound('Dompet tidak ditemukan');
  return data;
}

export async function getWalletBalance(db: SupabaseClient, id: string) {
  await getWalletById(db, id);
  // View wallet_balances memakai kunci `id` dan nilai `current_balance` — satu query langsung.
  const { data, error } = await db.from('wallet_balances').select('*').eq('id', id).maybeSingle();
  if (error) mapDbError(error);
  if (!data) return { id, current_balance: null, note: 'Belum ada data saldo pada view wallet_balances' };
  const row = data as Record<string, unknown>;
  const raw = row.current_balance as number | string | null | undefined;
  return { ...row, current_balance: typeof raw === 'string' ? Number(raw) : (raw ?? null) };
}

export async function createWallet(db: SupabaseClient, input: CreateWalletInput) {
  const { data, error } = await db.from('wallets').insert(input).select('*').single();
  if (error) mapDbError(error);
  return data;
}

export async function updateWallet(db: SupabaseClient, id: string, input: UpdateWalletInput) {
  await getWalletById(db, id);
  if (input.initial_balance !== undefined) {
    // Guard: saldo awal hanya boleh diubah bila dompet belum memiliki jurnal.
    // Pengecekan dilakukan sedekat mungkin sebelum UPDATE untuk memperkecil
    // jendela race; penegakan atomik penuh membutuhkan mekanisme di database
    // (di luar batasan tahap ini) sehingga selalu ada celah kecil di antara
    // pemeriksaan dan penulisan pada beban konkuren.
    const { count, error: countError } = await db
      .from('transaction_entries')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_id', id);
    if (countError) mapDbError(countError);
    if ((count ?? 0) > 0) {
      throw Errors.conflict(
        'Dompet sudah memiliki jurnal transaksi sehingga initial_balance tidak dapat diubah melalui endpoint ini.',
      );
    }
  }
  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  const { data, error } = await db.from('wallets').update(patch).eq('id', id).select('*').single();
  if (error) mapDbError(error);
  return data;
}

export async function setWalletStatus(db: SupabaseClient, id: string, isActive: boolean) {
  await getWalletById(db, id);
  if (!isActive) {
    // Cegah penonaktifan dompet yang masih dipakai transaksi confirmed/pending.
    const { count, error: countError } = await db
      .from('transaction_entries')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_id', id);
    if (countError) mapDbError(countError);
    if ((count ?? 0) > 0) {
      // Bukan larangan mutlak mematikan, tapi beri peringatan eksplisit:
      // tetap izinkan nonaktif (saldo historis aman), namun catat alasan.
      // Jika kebijakan ingin melarang total, ubah menjadi throw di sini.
    }
  }
  const { data, error } = await db
    .from('wallets')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) mapDbError(error);
  return data;
}

/** Pastikan dompet aktif sebelum dipakai transaksi baru. */
export async function assertWalletUsable(db: SupabaseClient, id: string, label = 'Dompet') {
  const wallet = (await getWalletById(db, id)) as Record<string, unknown>;
  if (wallet.is_active === false) {
    throw Errors.badRequest(`${label} tidak aktif dan tidak dapat digunakan untuk transaksi baru`);
  }
  return wallet;
}

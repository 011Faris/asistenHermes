import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import { toApiTransaction } from '../transactions/transactions.service.js';
import { currentMonthRangeInZone, endOfDayExclusiveInZone, startOfDayInZone } from '../../utils/timezone.js';

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

export async function getDashboardSummary(db: SupabaseClient, timeZone: string) {
  const now = new Date();
  const dayStart = startOfDayInZone(now, timeZone).toISOString();
  const dayEnd = endOfDayExclusiveInZone(now, timeZone).toISOString();
  const { start: monthStart, end: monthEnd } = currentMonthRangeInZone(now, timeZone);
  const monthStartIso = monthStart.toISOString();
  const monthEndIso = monthEnd.toISOString();

  // 1. Saldo per dompet dari view wallet_balances + daftar dompet.
  const { data: wallets, error: walletsError } = await db.from('wallets').select('*').eq('is_active', true);
  if (walletsError) mapDbError(walletsError);
  const { data: balances, error: balancesError } = await db.from('wallet_balances').select('*');
  if (balancesError) mapDbError(balancesError);
  // View wallet_balances memakai kunci `id` dan nilai `current_balance` (numeric).
  const balanceByWallet = new Map<string, number | null>();
  for (const row of (balances ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.id ?? '');
    const raw = row.current_balance as number | string | null | undefined;
    const val = typeof raw === 'string' ? Number(raw) : (raw ?? null);
    if (key) balanceByWallet.set(key, val);
  }
  const walletList = ((wallets ?? []) as Array<Record<string, unknown>>).map((w) => ({
    ...w,
    current_balance: balanceByWallet.get(String(w.id)) ?? null,
  }));
  const totalBalance = walletList.reduce<number>(
    (sum, w) => sum + (typeof w.current_balance === 'number' ? w.current_balance : 0),
    0,
  );

  // 2. Transaksi bulan berjalan (confirmed saja).
  // Kolom DB aktual: transaction_type (kontrak API tetap `type`, diterjemahkan saat respons).
  const { data: monthTx, error: monthTxError } = await db
    .from('transactions')
    .select('id, transaction_type, status, transaction_date')
    .eq('status', 'confirmed')
    .gte('transaction_date', monthStartIso)
    .lt('transaction_date', monthEndIso);
  if (monthTxError) mapDbError(monthTxError);
  const monthTxIds = ((monthTx ?? []) as Array<{ id: string; transaction_type: string }>).map((t) => t.id);

  let totalIncome = 0;
  let totalExpense = 0;
  if (monthTxIds.length > 0) {
    const { data: entries, error: entriesError } = await db
      .from('transaction_entries')
      .select('transaction_id, amount_signed')
      .in('transaction_id', monthTxIds);
    if (entriesError) mapDbError(entriesError);
    const typeById = new Map(
      ((monthTx ?? []) as Array<{ id: string; transaction_type: string }>).map((t) => [t.id, t.transaction_type]),
    );
    for (const e of (entries ?? []) as Array<{ transaction_id: string; amount_signed: number | string }>) {
      const amt = typeof e.amount_signed === 'string' ? Number(e.amount_signed) : e.amount_signed;
      const type = typeById.get(e.transaction_id);
      // Entries income bernilai positif, expense negatif. Transfer: + di tujuan, - di asal → net 0.
      if (type === 'income') totalIncome += Math.max(0, amt);
      else if (type === 'expense') totalExpense += Math.abs(Math.min(0, amt));
    }
  }
  const incomeTx = ((monthTx ?? []) as Array<{ transaction_type: string }>).filter(
    (t) => t.transaction_type === 'income',
  ).length;
  const expenseTx = ((monthTx ?? []) as Array<{ transaction_type: string }>).filter(
    (t) => t.transaction_type === 'expense',
  ).length;

  // 3. Jadwal hari ini & mendatang.
  const { data: todaySchedules, error: todayError } = await db
    .from('schedules')
    .select('*')
    .gte('start_time', dayStart)
    .lt('start_time', dayEnd)
    .order('start_time', { ascending: true });
  if (todayError) mapDbError(todayError);
  const { data: upcomingSchedules, error: upcomingError } = await db
    .from('schedules')
    .select('*')
    .gte('start_time', dayEnd)
    .eq('status', 'scheduled')
    .order('start_time', { ascending: true })
    .limit(10);
  if (upcomingError) mapDbError(upcomingError);

  // 4. Transaksi terbaru (confirmed, 10 terakhir dengan entries).
  const { data: recentTx, error: recentError } = await db
    .from('transactions')
    .select('*')
    .eq('status', 'confirmed')
    .order('transaction_date', { ascending: false })
    .limit(10);
  if (recentError) mapDbError(recentError);

  return {
    balances: {
      total: totalBalance,
      wallets: walletList,
    },
    month: {
      start: monthStartIso,
      end: monthEndIso,
      timezone: timeZone,
      total_income: totalIncome,
      total_expense: totalExpense,
      net: totalIncome - totalExpense,
      transaction_count: monthTxIds.length,
      income_count: incomeTx,
      expense_count: expenseTx,
    },
    schedules: {
      today: todaySchedules ?? [],
      upcoming: upcomingSchedules ?? [],
    },
    recent_transactions: ((recentTx ?? []) as Array<Record<string, unknown>>).map(toApiTransaction),
  };
}

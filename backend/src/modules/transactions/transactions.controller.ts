import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { Errors } from '../../utils/errors.js';
import {
  createExpense,
  createIncome,
  createTransfer,
  getTransactionDetail,
  listTransactions,
} from './transactions.service.js';

/**
 * Idempotency-Key wajib (UUID) via HTTP header untuk semua POST transaksi.
 * Dilewatkan ke service sebagai `p_idempotency_key` RPC.
 */
function requireIdempotencyKey(req: Request): string {
  const parsed = z.string().uuid('Idempotency-Key harus berupa UUID').safeParse(req.header('idempotency-key'));
  if (!parsed.success) {
    throw Errors.validation('Idempotency-Key wajib disertakan sebagai UUID pada header', [
      { path: 'header.Idempotency-Key', message: 'Wajib berupa UUID yang valid' },
    ]);
  }
  return parsed.data;
}

export async function listTransactionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listTransactions(getSupabase(), req.query as never);
    return sendSuccess(res, data, 'Daftar transaksi berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function getTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getTransactionDetail(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Transaksi berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function createIncomeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createIncome(getSupabase(), req.body, requireIdempotencyKey(req));
    return sendSuccess(res, data, 'Pemasukan berhasil dicatat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function createExpenseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createExpense(getSupabase(), req.body, requireIdempotencyKey(req));
    return sendSuccess(res, data, 'Pengeluaran berhasil dicatat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function createTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createTransfer(getSupabase(), req.body, requireIdempotencyKey(req));
    return sendSuccess(res, data, 'Transfer berhasil dicatat', 201);
  } catch (err) {
    return next(err);
  }
}

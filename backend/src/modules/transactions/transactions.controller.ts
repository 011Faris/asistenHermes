import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createExpense,
  createIncome,
  createTransfer,
  getTransactionDetail,
  listTransactions,
} from './transactions.service.js';

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
    const data = await createIncome(getSupabase(), req.body);
    return sendSuccess(res, data, 'Pemasukan berhasil dicatat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function createExpenseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createExpense(getSupabase(), req.body);
    return sendSuccess(res, data, 'Pengeluaran berhasil dicatat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function createTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createTransfer(getSupabase(), req.body);
    return sendSuccess(res, data, 'Transfer berhasil dicatat', 201);
  } catch (err) {
    return next(err);
  }
}

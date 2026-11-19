import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createWallet,
  getWalletBalance,
  getWalletById,
  listWalletsWithBalances,
  setWalletStatus,
  updateWallet,
} from './wallets.service.js';

export async function listWalletsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // Selalu sertakan info saldo dari view wallet_balances.
    void req.query;
    const data = await listWalletsWithBalances(getSupabase());
    return sendSuccess(res, data, 'Daftar dompet berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function getWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getWalletById(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Dompet berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function getWalletBalanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getWalletBalance(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Saldo dompet berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function createWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createWallet(getSupabase(), req.body);
    return sendSuccess(res, data, 'Dompet berhasil dibuat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function updateWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await updateWallet(getSupabase(), req.params.id, req.body);
    return sendSuccess(res, data, 'Dompet berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

export async function updateWalletStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await setWalletStatus(getSupabase(), req.params.id, req.body.is_active);
    return sendSuccess(res, data, 'Status dompet berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

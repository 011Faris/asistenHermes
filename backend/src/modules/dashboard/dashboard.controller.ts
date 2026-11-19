import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../../config/env.js';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { getDashboardSummary } from './dashboard.service.js';

export async function getDashboardSummaryHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    let timeZone = 'Asia/Jakarta';
    try {
      timeZone = getEnv().TIMEZONE;
    } catch {
      // default
    }
    const data = await getDashboardSummary(getSupabase(), timeZone);
    return sendSuccess(res, data, 'Ringkasan dashboard berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

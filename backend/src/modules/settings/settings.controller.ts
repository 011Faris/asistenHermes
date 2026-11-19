import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { getSettings, updateSettings } from './settings.service.js';

export async function getSettingsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSettings(getSupabase());
    return sendSuccess(res, data, 'Pengaturan berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function updateSettingsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await updateSettings(getSupabase(), req.body);
    return sendSuccess(res, data, 'Pengaturan berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

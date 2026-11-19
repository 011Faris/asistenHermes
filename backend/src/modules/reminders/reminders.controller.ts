import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
} from './reminders.service.js';

export async function listRemindersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listReminders(getSupabase(), req.query as never);
    return sendSuccess(res, data, 'Daftar pengingat berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function createReminderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createReminder(getSupabase(), req.body);
    return sendSuccess(res, data, 'Pengingat berhasil dibuat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function updateReminderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await updateReminder(getSupabase(), req.params.id, req.body);
    return sendSuccess(res, data, 'Pengingat berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

export async function deleteReminderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await deleteReminder(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Pengingat berhasil dihapus');
  } catch (err) {
    return next(err);
  }
}

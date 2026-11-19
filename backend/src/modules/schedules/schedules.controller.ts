import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../../config/env.js';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createSchedule,
  deleteSchedule,
  getScheduleById,
  listSchedules,
  setScheduleStatus,
  updateSchedule,
} from './schedules.service.js';

function timezone(): string {
  try {
    return getEnv().TIMEZONE;
  } catch {
    return 'Asia/Jakarta';
  }
}

export async function listSchedulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listSchedules(getSupabase(), req.query as never, timezone());
    return sendSuccess(res, data, 'Daftar jadwal berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function getScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getScheduleById(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Jadwal berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function createScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createSchedule(getSupabase(), req.body);
    return sendSuccess(res, data, 'Jadwal berhasil dibuat', 201);
  } catch (err) {
    return next(err);
  }
}

export async function updateScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await updateSchedule(getSupabase(), req.params.id, req.body);
    return sendSuccess(res, data, 'Jadwal berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

export async function updateScheduleStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await setScheduleStatus(getSupabase(), req.params.id, req.body.status);
    return sendSuccess(res, data, 'Status jadwal berhasil diperbarui');
  } catch (err) {
    return next(err);
  }
}

export async function deleteScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await deleteSchedule(getSupabase(), req.params.id);
    return sendSuccess(res, data, 'Jadwal berhasil dihapus');
  } catch (err) {
    return next(err);
  }
}

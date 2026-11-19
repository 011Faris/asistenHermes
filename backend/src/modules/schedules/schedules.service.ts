import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import { endOfDayExclusiveInZone, startOfDayInZone } from '../../utils/timezone.js';
import type { CreateScheduleInput, ListSchedulesQuery, UpdateScheduleInput } from './schedules.validation.js';

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

/**
 * Kontrak API memakai `start_time`/`end_time`, kolom database aktual
 * adalah `start_at`/`end_at`. Translasi DB -> API dan API -> DB
 * dipusatkan pada dua fungsi ini (mengikuti pola toApiTransaction
 * pada modul transactions).
 */
export function toDbSchedule(input: Record<string, unknown>): Record<string, unknown> {
  const { start_time, end_time, ...rest } = input;
  return {
    ...rest,
    ...(typeof start_time === 'string' ? { start_at: start_time } : {}),
    ...(end_time === null || typeof end_time === 'string' ? { end_at: end_time } : {}),
  };
}

export function toApiSchedule(row: Record<string, unknown>): Record<string, unknown> {
  const { start_at, end_at, ...rest } = row;
  return { ...rest, start_time: start_at ?? null, end_time: end_at ?? null };
}

function toJakartaDayRange(dateKey: string, timeZone: string): { start: string; end: string } {
  const ref = new Date(`${dateKey}T12:00:00+07:00`);
  const start = startOfDayInZone(ref, timeZone).toISOString();
  const end = endOfDayExclusiveInZone(ref, timeZone).toISOString();
  return { start, end };
}

export async function listSchedules(db: SupabaseClient, q: ListSchedulesQuery, timeZone: string) {
  let query = db.from('schedules').select('*').order('start_at', { ascending: true }).limit(q.limit);

  if (q.status) query = query.eq('status', q.status);

  const isToday = q.today === 'true' || q.today === '1';
  const isUpcoming = q.upcoming === 'true' || q.upcoming === '1';

  if (q.date) {
    const { start, end } = toJakartaDayRange(q.date, timeZone);
    query = query.gte('start_at', start).lt('start_at', end);
  } else if (isToday) {
    const now = new Date();
    const start = startOfDayInZone(now, timeZone).toISOString();
    const end = endOfDayExclusiveInZone(now, timeZone).toISOString();
    query = query.gte('start_at', start).lt('start_at', end);
  } else {
    if (q.start_date) {
      const { start } = toJakartaDayRange(q.start_date, timeZone);
      query = query.gte('start_at', start);
    }
    if (q.end_date) {
      const { end } = toJakartaDayRange(q.end_date, timeZone);
      query = query.lt('start_at', end);
    }
    if (isUpcoming) query = query.gte('start_at', new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) mapDbError(error);
  return (data ?? []).map((row) => toApiSchedule(row as Record<string, unknown>));
}

export async function getScheduleById(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('schedules').select('*').eq('id', id).maybeSingle();
  if (error) mapDbError(error);
  if (!data) throw Errors.notFound('Jadwal tidak ditemukan');
  return toApiSchedule(data as Record<string, unknown>);
}

export async function createSchedule(db: SupabaseClient, input: CreateScheduleInput) {
  if (input.end_time && new Date(input.end_time) < new Date(input.start_time)) {
    throw Errors.badRequest('Waktu selesai tidak boleh sebelum waktu mulai');
  }
  const { data, error } = await db
    .from('schedules')
    .insert({ ...toDbSchedule(input), status: 'scheduled' })
    .select('*')
    .single();
  if (error) mapDbError(error);
  return toApiSchedule(data as Record<string, unknown>);
}

export async function updateSchedule(db: SupabaseClient, id: string, input: UpdateScheduleInput) {
  await getScheduleById(db, id);
  const { data, error } = await db
    .from('schedules')
    .update({ ...toDbSchedule(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) mapDbError(error);
  return toApiSchedule(data as Record<string, unknown>);
}

export async function setScheduleStatus(db: SupabaseClient, id: string, status: 'scheduled' | 'completed' | 'cancelled') {
  await getScheduleById(db, id);
  const { data, error } = await db
    .from('schedules')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) mapDbError(error);
  return data;
}

export async function deleteSchedule(db: SupabaseClient, id: string) {
  await getScheduleById(db, id);
  const { error } = await db.from('schedules').delete().eq('id', id);
  if (error) mapDbError(error);
  return { id };
}

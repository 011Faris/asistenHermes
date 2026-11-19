import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import type { CreateReminderInput, ListRemindersQuery, UpdateReminderInput } from './reminders.validation.js';

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

export async function listReminders(db: SupabaseClient, q: ListRemindersQuery) {
  let query = db.from('reminders').select('*').order('remind_at', { ascending: true }).limit(q.limit);
  const pendingOnly = q.pending_only === 'true' || q.pending_only === '1';
  if (pendingOnly) query = query.eq('status', 'pending');
  else if (q.status) query = query.eq('status', q.status);
  if (q.schedule_id) query = query.eq('schedule_id', q.schedule_id);
  const { data, error } = await query;
  if (error) mapDbError(error);
  return data ?? [];
}

export async function getReminderById(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('reminders').select('*').eq('id', id).maybeSingle();
  if (error) mapDbError(error);
  if (!data) throw Errors.notFound('Pengingat tidak ditemukan');
  return data;
}

export async function createReminder(db: SupabaseClient, input: CreateReminderInput) {
  if (input.schedule_id) {
    const { data: schedule, error: sErr } = await db
      .from('schedules')
      .select('id')
      .eq('id', input.schedule_id)
      .maybeSingle();
    if (sErr) mapDbError(sErr);
    if (!schedule) throw Errors.badRequest('schedule_id tidak merujuk ke jadwal yang ada');
  }
  // Tahap ini hanya mengelola data; pengiriman WhatsApp dilakukan tahap berikutnya.
  const { data, error } = await db
    .from('reminders')
    .insert({ ...input, status: 'pending' })
    .select('*')
    .single();
  if (error) mapDbError(error);
  return data;
}

export async function updateReminder(db: SupabaseClient, id: string, input: UpdateReminderInput) {
  await getReminderById(db, id);
  const { data, error } = await db
    .from('reminders')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) mapDbError(error);
  return data;
}

export async function deleteReminder(db: SupabaseClient, id: string) {
  await getReminderById(db, id);
  const { error } = await db.from('reminders').delete().eq('id', id);
  if (error) mapDbError(error);
  return { id };
}

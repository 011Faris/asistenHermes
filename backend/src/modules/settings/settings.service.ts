import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../utils/errors.js';
import type { UpdateSettingsInput } from './settings.validation.js';

export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Jakarta',
  currency: 'IDR',
  morning_briefing_enabled: true,
  morning_briefing_time: '06:00',
  whatsapp_enabled: false,
} as const;

function mapDbError(err: { message: string; code?: string }): never {
  throw Errors.upstream(`Database error: ${err.message}`, { code: err.code });
}

/** Tabel user_settings adalah singleton (satu baris, tanpa user_id). */
export async function getSettings(db: SupabaseClient) {
  const { data, error } = await db.from('user_settings').select('*').limit(1).maybeSingle();
  if (error) mapDbError(error);
  return data ?? { ...DEFAULT_SETTINGS, note: 'Menggunakan nilai default; baris user_settings belum ada' };
}

export async function updateSettings(db: SupabaseClient, input: UpdateSettingsInput) {
  const current = await getSettings(db);
  if (!current || !('id' in current)) {
    // Belum ada baris: buat satu baris default + patch.
    const { data, error } = await db
      .from('user_settings')
      .insert({ ...DEFAULT_SETTINGS, ...input })
      .select('*')
      .single();
    if (error) mapDbError(error);
    return data;
  }
  const { data, error } = await db
    .from('user_settings')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', (current as { id: string }).id)
    .select('*')
    .single();
  if (error) mapDbError(error);
  return data;
}

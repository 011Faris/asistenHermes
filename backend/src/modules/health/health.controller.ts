import type { Request, Response } from 'express';
import { getEnv } from '../../config/env.js';
import { getSupabase } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';

export async function healthCheck(_req: Request, res: Response): Promise<Response> {
  const started = Date.now();
  let supabaseStatus: 'up' | 'down' = 'down';
  let supabaseLatencyMs: number | null = null;

  try {
    // Query ringan tanpa menyentuh data sensitif.
    const { error } = await getSupabase().from('wallets').select('id', { count: 'exact', head: true });
    if (!error) supabaseStatus = 'up';
    supabaseLatencyMs = Date.now() - started;
  } catch {
    supabaseLatencyMs = Date.now() - started;
    supabaseStatus = 'down';
  }

  let version = '0.1.0';
  let timezone = 'Asia/Jakarta';
  try {
    const env = getEnv();
    version = env.APP_VERSION;
    timezone = env.TIMEZONE;
  } catch {
    // default di atas
  }

  return sendSuccess(
    res,
    {
      status: 'ok',
      supabase: supabaseStatus,
      supabaseLatencyMs,
      serverTime: new Date().toISOString(),
      timezone,
      version,
    },
    supabaseStatus === 'up' ? 'Backend sehat dan Supabase terhubung' : 'Backend berjalan, Supabase tidak terjangkau',
    supabaseStatus === 'up' ? 200 : 503,
  );
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let cached: SupabaseClient | null = null;

/**
 * Supabase client server-side memakai SERVICE ROLE KEY.
 * Hanya dipakai di backend — jangan pernah expose ke frontend.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'personal-ai-assistant-backend' } },
  });
  return cached;
}

/** Reset cache client — dipakai oleh test. */
export function resetSupabaseCache(): void {
  cached = null;
}

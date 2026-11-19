import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url('SUPABASE_URL harus berupa URL valid'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY wajib diisi'),
  ASSISTANT_API_KEY: z.string().min(1, 'ASSISTANT_API_KEY wajib diisi'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  TIMEZONE: z.string().default('Asia/Jakarta'),
  APP_VERSION: z.string().default('0.1.0'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parse & validasi environment. Throw dengan pesan jelas bila ada yang kurang. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset cache env — dipakai oleh test. */
export function resetEnvCache(): void {
  cached = null;
}

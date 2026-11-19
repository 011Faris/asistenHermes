import { getEnv } from './config/env.js';
import { getSupabase } from './config/supabase.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

async function main() {
  const env = getEnv();
  const app = createApp();

  // Verifikasi koneksi Supabase sebelum menerima trafik.
  try {
    const { error } = await getSupabase().from('wallets').select('id', { count: 'exact', head: true });
    if (error) {
      logger.warn({ err: error.message }, 'Supabase belum terverifikasi saat boot — server tetap berjalan');
    } else {
      logger.info('Koneksi Supabase terverifikasi');
    }
  } catch (err) {
    logger.warn({ err }, 'Supabase belum terverifikasi saat boot — server tetap berjalan');
  }

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Backend Personal AI Assistant berjalan');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Menerima sinyal shutdown, menutup server…');
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Gagal graceful shutdown');
        process.exit(1);
      }
      logger.info('Server berhenti dengan bersih');
      process.exit(0);
    });
    // Paksa keluar bila koneksi menggantung.
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Gagal menjalankan server');
  process.exit(1);
});

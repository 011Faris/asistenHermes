import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { getEnv } from './config/env.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';
import { sendSuccess } from './utils/response.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  let env;
  try {
    env = getEnv();
  } catch {
    env = {
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    } as ReturnType<typeof getEnv>;
  }

  app.use(helmet());
  app.use(
    cors({
      // Production: hanya izinkan frontend yang dikonfigurasi. Jangan pakai "*".
      origin: env.NODE_ENV === 'production' ? [env.FRONTEND_URL] : true,
      credentials: true,
    }),
  );
  // Batasi ukuran body agar tidak disalahgunakan.
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      // Redaksi header sensitif pada log HTTP.
      customProps: () => ({}),
    }),
  );

  // Rate limiting global — proteksi brute force API key & abuse.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'production' ? 300 : 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Terlalu banyak permintaan, coba lagi nanti', error: { code: 'RATE_LIMITED' } },
  });
  app.use('/api', limiter);

  app.get('/', (_req, res) => sendSuccess(res, { service: 'personal-ai-assistant-backend' }, 'Backend Personal AI Assistant aktif'));

  // Auth di dalam middleware (health dikecualikan di sana).
  app.use('/api', authMiddleware);
  app.use('/api', apiRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

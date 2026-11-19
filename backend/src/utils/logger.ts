import pino from 'pino';
import { getEnv } from '../config/env.js';

function buildLogger() {
  let level = 'info';
  try {
    const env = getEnv();
    level = env.NODE_ENV === 'production' ? 'info' : 'debug';
  } catch {
    level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  }

  return pino({
    level,
    // Jangan pernah log secret / token / nomor rekening.
    redact: {
      paths: [
        '*.apiKey',
        '*.api_key',
        '*.authorization',
        '*.token',
        '*.secret',
        '*.password',
        '*.service_role',
        '*.account_number',
        'req.headers.authorization',
        'req.headers["x-api-key"]',
      ],
      censor: '[REDACTED]',
    },
  });
}

export const logger = buildLogger();

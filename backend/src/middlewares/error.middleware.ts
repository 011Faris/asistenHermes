import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): Response {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Terjadi kesalahan';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    message = res.app.get('env') === 'production' ? 'Terjadi kesalahan' : err.message;
    try {
      if (getEnv().NODE_ENV !== 'production') details = { name: err.name, message: err.message };
    } catch {
      details = { name: err.name };
    }
  }

  if (status >= 500) {
    logger.error({ err, status, code }, 'Unhandled error');
  } else {
    logger.warn({ status, code, message }, 'Request error');
  }

  // Jangan pernah bocorkan stack trace ke client pada production.
  return sendError(res, message, code, status, details);
}

export function notFoundMiddleware(_req: Request, res: Response): Response {
  return sendError(res, 'Endpoint tidak ditemukan', 'NOT_FOUND', 404);
}

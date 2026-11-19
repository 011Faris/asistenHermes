import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { Errors } from '../utils/errors.js';

const PUBLIC_PATHS = new Set(['/api/health', '/health', '/']);

function fullPath(req: Request): string {
  return `${req.baseUrl}${req.path}`;
}

function extractApiKey(req: Request): string | undefined {
  const headerKey = req.header('x-api-key');
  if (headerKey) return headerKey;
  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return undefined;
}

/**
 * API key auth untuk single-user backend.
 * Health check dikecualikan; seluruh endpoint /api/* lain wajib API key.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.has(req.path) || PUBLIC_PATHS.has(fullPath(req))) return next();
  // Pengecualian sempit: prefix /api/instabox/* memakai autentikasi khusus
  // lingkup-router (master atau UI key). Route lain tidak terpengaruh.
  const full = fullPath(req);
  if (full === '/api/instabox' || full.startsWith('/api/instabox/')) return next();
  let expected: string;
  try {
    expected = getEnv().ASSISTANT_API_KEY;
  } catch (err) {
    return next(err);
  }
  const provided = extractApiKey(req);
  if (!provided || provided !== expected) {
    return next(Errors.unauthorized());
  }
  next();
}

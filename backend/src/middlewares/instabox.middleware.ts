import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { Errors } from '../utils/errors.js';

function extractApiKey(req: Request): string | undefined {
  const headerKey = req.header('x-api-key');
  if (headerKey) return headerKey;
  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return undefined;
}

/**
 * Autentikasi lingkup router InstaBox: kunci master ATAU kunci UI.
 * Router ini dipasang setelah pengecualian prefix /api/instabox/* pada
 * auth global, sehingga route finansial tidak terpengaruh (tetap master-only).
 */
export function instaboxAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  let masterKey: string;
  let uiKey: string | undefined;
  try {
    const env = getEnv();
    masterKey = env.ASSISTANT_API_KEY;
    uiKey = env.INSTABOX_UI_KEY;
  } catch (err) {
    return next(err);
  }
  const provided = extractApiKey(req);
  if (provided && (provided === masterKey || (typeof uiKey === 'string' && uiKey.length > 0 && provided === uiKey))) {
    return next();
  }
  return next(Errors.unauthorized());
}

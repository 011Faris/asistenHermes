import type { Response } from 'express';

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(res: Response, data: T, message = 'Data berhasil diambil', status = 200): Response {
  const body: SuccessEnvelope<T> = { success: true, message, data };
  return res.status(status).json(body);
}

export function sendError(res: Response, message: string, code = 'INTERNAL_ERROR', status = 500, details?: unknown): Response {
  const body: ErrorEnvelope = { success: false, message, error: { code, ...(details !== undefined ? { details } : {}) } };
  return res.status(status).json(body);
}

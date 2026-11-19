import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { Errors } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validasi Zod untuk body/query/params.
 * Hasil yang sudah diparsing menimpa req[source].
 */
export function validate(source: Source, schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      (req as unknown as Record<string, unknown>)[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          Errors.validation(
            'Validasi gagal',
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}

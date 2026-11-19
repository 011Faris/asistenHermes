/** Error operasional dengan HTTP status + machine-readable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  notFound: (message = 'Data tidak ditemukan', details?: unknown) =>
    new AppError(message, 404, 'NOT_FOUND', details),
  validation: (message = 'Validasi gagal', details?: unknown) =>
    new AppError(message, 400, 'VALIDATION_ERROR', details),
  unauthorized: (message = 'API key tidak valid') =>
    new AppError(message, 401, 'UNAUTHORIZED'),
  conflict: (message: string, details?: unknown) =>
    new AppError(message, 409, 'CONFLICT', details),
  badRequest: (message: string, details?: unknown) =>
    new AppError(message, 400, 'BAD_REQUEST', details),
  upstream: (message = 'Database mengembalikan error', details?: unknown) =>
    new AppError(message, 502, 'UPSTREAM_ERROR', details),
};

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = Number.isInteger(status) ? status : 500;
    this.code = code || 'INTERNAL_ERROR';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

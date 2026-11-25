/**
 * Error codes returned to API clients. They match the frontend's ApiErrorCode values
 * (VALIDATION, NOT_FOUND, DUPLICATE, IN_USE); anything else is treated as unknown there.
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'CSRF_FAILED'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'IN_USE'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  /** Dotted path of the offending value, e.g. "name" or "variants.2.sku". */
  readonly field: string;
  readonly message: string;
  readonly location?: 'body' | 'query' | 'params';
}

/** An expected, client-facing error. Anything else becomes a generic 500. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** The main field this error relates to (first detail for validation errors). */
  readonly field?: string;
  readonly details?: readonly ErrorDetail[];

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { field?: string; details?: readonly ErrorDetail[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.field = options.field;
    this.details = options.details;
  }

  static validation(message: string, field?: string, details?: readonly ErrorDetail[]): AppError {
    return new AppError(400, 'VALIDATION', message, { field, details });
  }

  static badRequest(message: string): AppError {
    return new AppError(400, 'BAD_REQUEST', message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static duplicate(message: string, field?: string): AppError {
    return new AppError(409, 'DUPLICATE', message, { field });
  }

  static inUse(message: string): AppError {
    return new AppError(409, 'IN_USE', message);
  }

  static unauthenticated(message = 'Please sign in to continue.'): AppError {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You do not have permission to do this.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }
}

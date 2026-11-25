import type { ErrorRequestHandler, RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import { translatePgError } from '../errors/pg-errors.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

/** Node / PostgreSQL error codes meaning "the database is unreachable or misconfigured". */
const DATABASE_UNAVAILABLE = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  '57P01', // admin shutdown
  '57P03', // cannot connect now
  '08001',
  '08006',
  '28P01', // invalid password
  '3D000', // database does not exist
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function bodyParserType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const { type } = error as { type: unknown };
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

function isConnectionTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    /timeout exceeded when trying to connect|Connection terminated/i.test(error.message)
  );
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const fromDatabase = translatePgError(error);
  if (fromDatabase) {
    return fromDatabase;
  }
  switch (bodyParserType(error)) {
    case 'entity.parse.failed':
      return AppError.badRequest('Request body is not valid JSON.');
    case 'entity.too.large':
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  const code = errorCode(error);
  if ((code && DATABASE_UNAVAILABLE.has(code)) || isConnectionTimeout(error)) {
    return new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'The database is not available. Please try again shortly.',
      {
        cause: error,
      },
    );
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', {
    cause: error,
  });
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const appError = toAppError(error);
  if (appError.status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${appError.status}`, appError.cause ?? error);
  }
  sendError(res, appError);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, AppError.notFound(`Route ${req.method} ${req.path} not found.`));
};

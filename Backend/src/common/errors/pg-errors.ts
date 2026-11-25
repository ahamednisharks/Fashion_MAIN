import pg from 'pg';

import { AppError } from './app-error.js';
import { CONSTRAINT_MESSAGES } from './constraint-messages.js';

/** PostgreSQL SQLSTATE codes we translate into client errors. */
const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  notNullViolation: '23502',
  invalidTextRepresentation: '22P02',
  stringTooLong: '22001',
  numericOutOfRange: '22003',
} as const;

/**
 * Converts known PostgreSQL errors (constraint violations, bad input) into AppErrors.
 * Returns null for anything else so it is handled as an internal error.
 */
export function translatePgError(error: unknown): AppError | null {
  if (!(error instanceof pg.DatabaseError)) {
    return null;
  }
  const info = error.constraint ? CONSTRAINT_MESSAGES[error.constraint] : undefined;

  switch (error.code) {
    case PG.uniqueViolation:
      return AppError.duplicate(
        info?.message ?? 'A record with the same value already exists.',
        info?.field,
      );

    case PG.foreignKeyViolation:
      // "is still referenced" → deleting a row that others depend on.
      if (error.detail?.includes('is still referenced')) {
        return AppError.inUse(info?.inUseMessage ?? 'This record is in use and cannot be deleted.');
      }
      return AppError.validation(
        info?.message ?? 'A referenced record does not exist.',
        info?.field,
      );

    case PG.checkViolation:
      return AppError.validation(
        info?.message ?? 'One or more values are not allowed.',
        info?.field,
      );

    case PG.notNullViolation:
      return AppError.validation(
        `${error.column ?? 'A required value'} is required.`,
        error.column ?? undefined,
      );

    case PG.stringTooLong:
    case PG.numericOutOfRange:
    case PG.invalidTextRepresentation:
      return AppError.validation('One or more values have an invalid format or are too long.');

    default:
      return null;
  }
}

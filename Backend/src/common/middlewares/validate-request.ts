import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { AppError, type ErrorDetail } from '../errors/app-error.js';

export interface RequestSchemas {
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
}

/** Parsed (and normalised) request parts, stored on res.locals.input. */
export interface ValidatedInput {
  params: unknown;
  query: unknown;
  body: unknown;
}

const LOCATIONS = ['params', 'query', 'body'] as const;

/** Drops empty query values so `?status=` means "no filter" rather than an invalid value. */
function withoutEmptyValues(query: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''));
}

/**
 * Validates params, query and body with Zod. On failure responds 400 VALIDATION with every
 * problem listed in `details` (field paths like "variants.2.sku").
 */
export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    const input: ValidatedInput = { params: undefined, query: undefined, body: undefined };
    const details: ErrorDetail[] = [];

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) {
        continue;
      }
      const raw =
        location === 'query'
          ? withoutEmptyValues(req.query)
          : location === 'body'
            ? (req.body ?? {})
            : req.params;
      const result = schema.safeParse(raw);
      if (result.success) {
        input[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({
            field: issue.path.map(String).join('.') || location,
            message: issue.message,
            location,
          });
        }
      }
    }

    const [first] = details;
    if (first) {
      next(AppError.validation(first.message, first.field, details));
      return;
    }
    res.locals['input'] = input;
    next();
  };
}

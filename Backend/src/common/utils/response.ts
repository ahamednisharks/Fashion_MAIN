import type { Response } from 'express';
import { z } from 'zod';

import type { AppError } from '../errors/app-error.js';

/*
 * Response envelope
 *   success: { "success": true,  "data": … }
 *   failure: { "success": false, "error": { "code", "message", "field"?, "details"? } }
 *   204 No Content for deletes.
 */

export function sendSuccess(res: Response, status: number, data: unknown): void {
  if (status === 204) {
    res.status(204).end();
    return;
  }
  res.status(status).json({ success: true, data });
}

export function sendError(res: Response, error: AppError): void {
  res.status(error.status).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
      ...(error.details?.length ? { details: error.details } : {}),
    },
  });
}

/** OpenAPI: success envelope around `data`. */
export function successEnvelope(data: z.ZodType) {
  return z.object({ success: z.literal(true), data });
}

export const errorEnvelopeSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.enum([
        'VALIDATION',
        'BAD_REQUEST',
        'NOT_FOUND',
        'DUPLICATE',
        'IN_USE',
        'PAYLOAD_TOO_LARGE',
        'SERVICE_UNAVAILABLE',
        'INTERNAL_ERROR',
      ]),
      message: z.string(),
      field: z
        .string()
        .optional()
        .describe('Main field the error relates to, e.g. "variants.2.sku".'),
      details: z
        .array(
          z.object({
            field: z.string(),
            message: z.string(),
            location: z.enum(['body', 'query', 'params']).optional(),
          }),
        )
        .optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

import { z } from 'zod';

import { statusEnum, uuidField } from './fields.js';

export const MAX_PAGE_SIZE = 100;

/**
 * Query string for list endpoints:
 *   ?search=&status=active&page=1&pageSize=10&sortBy=name&sortOrder=asc (+ resource filters)
 * `sortBy` is an allowlist (enum), so it can never inject SQL.
 * Empty query values (e.g. `status=`) are dropped before validation (see validateRequest).
 */
export function createListQuerySchema<
  const TSort extends readonly [string, ...string[]],
  TExtra extends z.ZodRawShape,
>(sortFields: TSort, extra: TExtra) {
  return z.object({
    search: z
      .string()
      .trim()
      .max(100)
      .default('')
      .describe('Free-text search (all words must match).'),
    status: statusEnum.optional().describe('Filter by status. Omit for all.'),
    page: z.coerce.number().int().min(1).max(100_000).default(1).describe('1-based page number.'),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(10)
      .describe(`Rows per page (max ${MAX_PAGE_SIZE}).`),
    sortBy: z.enum(sortFields).optional().describe('Sort field. Omit for the default order.'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    ...extra,
  });
}

/** Common shape every list query has after parsing. */
export interface BaseListQuery {
  search: string;
  status?: 'active' | 'inactive';
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export const lookupQuerySchema = z.object({
  status: statusEnum.optional().describe('Only records with this status. Omit for all.'),
});
export type LookupQuery = z.infer<typeof lookupQuerySchema>;

export const idParamsSchema = z.object({ id: uuidField() });
export type IdParams = z.infer<typeof idParamsSchema>;

export const statusBodySchema = z
  .object({ status: statusEnum })
  .meta({ id: 'StatusUpdate', description: 'New status.' });
export type StatusBody = z.infer<typeof statusBodySchema>;

/** ?field=name&value=Shirts&excludeId=… — live duplicate checks from forms. */
export function createExistsQuerySchema<const TFields extends readonly [string, ...string[]]>(
  fields: TFields,
) {
  return z.object({
    field: z.enum(fields),
    value: z.string().trim().min(1).max(200),
    excludeId: uuidField('excludeId').optional().describe('Ignore this record (when editing).'),
  });
}

export const existsResultSchema = z.object({ exists: z.boolean() }).meta({ id: 'ExistsResult' });

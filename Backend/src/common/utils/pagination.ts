import { z } from 'zod';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function toPaged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/** OpenAPI schema for a page of `item`. */
export function pagedSchema(item: z.ZodType) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
  });
}

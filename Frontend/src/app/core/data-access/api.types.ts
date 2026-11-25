import { EntityStatus } from '../models/base.model';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  field: string;
  direction: SortDirection;
}

/** '' means "any status". */
export type StatusFilter = EntityStatus | '';

/** Query accepted by every list endpoint. `page` is 1-based. */
export interface ListQuery {
  search: string;
  status: StatusFilter;
  /** Exact-match filters keyed by field name, e.g. { categoryId: '...' }. Empty values are ignored. */
  filters: Readonly<Record<string, string>>;
  page: number;
  pageSize: number;
  /** null = the resource's default order. */
  sort: SortState | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'IN_USE'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN';

/**
 * Error shape surfaced to the UI by every data source.
 * `field` is a form path (e.g. "name" or "variants.2.sku") so forms can show it on the right control.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly field?: string;

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.field = field;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Something went wrong. Please try again.';
  return new ApiError('UNKNOWN', message);
}

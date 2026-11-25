import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { PurchasableItem } from '../models/purchase-order.model';
import {
  AdjustmentInput,
  AdjustmentReason,
  AdjustmentStatus,
  AdjustmentSummary,
  StockAdjustment,
} from '../models/stock-adjustment.model';
import { StockFilter } from '../models/stock.model';
import { ApiError, PagedResult } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

export interface AdjustmentListQuery {
  search?: string;
  reason?: AdjustmentReason | '';
  status?: AdjustmentStatus | '';
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Which items to load onto an adjustment in one go. */
export interface AdjustmentItemsQuery {
  categoryId?: string;
  brandId?: string;
  stock?: StockFilter;
  /** Product status (default active). */
  status?: 'active' | 'inactive' | 'all';
}

/**
 * Stock adjustments — REST API at /stock-adjustments (administrators only). Items are scanned /
 * searched through PurchaseOrderService (they come with their purchase price). Needs the
 * backend: in 'mock' mode every call fails with a clear message.
 */
@Injectable({ providedIn: 'root' })
export class StockAdjustmentService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/stock-adjustments`;
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  /** The number the next adjustment dated `date` (default today) would get — not reserved. */
  nextNumber(date?: string): Observable<string> {
    const params = date ? new HttpParams().set('date', date) : new HttpParams();
    return this.call<{ adjNo: string }>(
      this.http.get<unknown>(`${this.url}/next-number`, { params }),
    ).pipe(map((result) => result.adjNo));
  }

  /** Items of a category / brand / stock state, with stock and purchase price. */
  items(query: AdjustmentItemsQuery): Observable<PurchasableItem[]> {
    let params = new HttpParams();
    for (const key of ['categoryId', 'brandId', 'stock', 'status'] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    return this.call(this.http.get<unknown>(`${this.url}/items`, { params }));
  }

  list(query: AdjustmentListQuery): Observable<PagedResult<AdjustmentSummary>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 10);
    for (const key of ['search', 'reason', 'status', 'from', 'to'] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    return this.call(this.http.get<unknown>(this.url, { params }));
  }

  get(id: string): Observable<StockAdjustment> {
    return this.call(this.http.get<unknown>(`${this.url}/${encodeURIComponent(id)}`));
  }

  create(input: AdjustmentInput): Observable<StockAdjustment> {
    return this.call(this.http.post<unknown>(this.url, input));
  }

  cancel(id: string): Observable<StockAdjustment> {
    return this.call(this.http.post<unknown>(`${this.url}/${encodeURIComponent(id)}/cancel`, {}));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Stock adjustments need the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

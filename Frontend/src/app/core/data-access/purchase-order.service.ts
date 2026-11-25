import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import {
  PoInput,
  PoStatus,
  PoSummary,
  PurchasableItem,
  PurchaseOrder,
} from '../models/purchase-order.model';
import { ApiError, PagedResult } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';
import { ItemSource } from './item-source';

export interface PoListQuery {
  search?: string;
  status?: PoStatus | '';
  supplierId?: string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Purchase orders — REST API at /purchase-orders (administrators only). Also the item source of
 * the PO scan box (items come with their purchase rate). Needs the backend: in 'mock' mode every
 * call fails with a clear message.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseOrderService implements ItemSource<PurchasableItem> {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/purchase-orders`;
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  lookup(code: string): Observable<PurchasableItem[]> {
    const params = new HttpParams().set('code', code.trim());
    return this.call(this.http.get<unknown>(`${this.url}/items/lookup`, { params }));
  }

  search(text: string, limit = 20): Observable<PurchasableItem[]> {
    const params = new HttpParams().set('search', text.trim()).set('limit', limit);
    return this.call(this.http.get<unknown>(`${this.url}/items`, { params }));
  }

  /** The number the next PO dated `date` (default today) would get — not reserved. */
  nextNumber(date?: string): Observable<string> {
    const params = date ? new HttpParams().set('date', date) : new HttpParams();
    return this.call<{ poNo: string }>(
      this.http.get<unknown>(`${this.url}/next-number`, { params }),
    ).pipe(map((result) => result.poNo));
  }

  list(query: PoListQuery): Observable<PagedResult<PoSummary>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 10);
    for (const key of ['search', 'status', 'supplierId', 'from', 'to'] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    return this.call(this.http.get<unknown>(this.url, { params }));
  }

  get(id: string): Observable<PurchaseOrder> {
    return this.call(this.http.get<unknown>(`${this.url}/${encodeURIComponent(id)}`));
  }

  create(input: PoInput): Observable<PurchaseOrder> {
    return this.call(this.http.post<unknown>(this.url, input));
  }

  update(id: string, input: PoInput): Observable<PurchaseOrder> {
    return this.call(this.http.put<unknown>(`${this.url}/${encodeURIComponent(id)}`, input));
  }

  cancel(id: string): Observable<PurchaseOrder> {
    return this.call(this.http.post<unknown>(`${this.url}/${encodeURIComponent(id)}/cancel`, {}));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Purchase orders need the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

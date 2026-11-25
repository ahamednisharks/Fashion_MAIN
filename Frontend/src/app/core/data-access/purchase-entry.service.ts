import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import {
  PeInput,
  PeLabelItem,
  PeStatus,
  PeSummary,
  PurchaseEntry,
  ReceivableOrder,
} from '../models/purchase-entry.model';
import { PoSummary } from '../models/purchase-order.model';
import { ApiError, PagedResult } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

export interface PeListQuery {
  search?: string;
  status?: PeStatus | '';
  supplierId?: string;
  purchaseOrderId?: string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Purchase entries — REST API at /purchase-entries (administrators only). Items to receive are
 * searched through PurchaseOrderService (they come with their purchase rate). Needs the backend:
 * in 'mock' mode every call fails with a clear message.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseEntryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/purchase-entries`;
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  /** The number the next entry received on `date` (default today) would get — not reserved. */
  nextNumber(date?: string): Observable<string> {
    const params = date ? new HttpParams().set('date', date) : new HttpParams();
    return this.call<{ peNo: string }>(
      this.http.get<unknown>(`${this.url}/next-number`, { params }),
    ).pipe(map((result) => result.peNo));
  }

  /** Open and partly received POs (of one supplier, or of all suppliers). */
  receivableOrders(supplierId?: string): Observable<PoSummary[]> {
    const params = supplierId ? new HttpParams().set('supplierId', supplierId) : new HttpParams();
    return this.call(this.http.get<unknown>(`${this.url}/orders`, { params }));
  }

  /** A PO's lines as items to receive (current item prices, ordered / received so far). */
  receivableOrder(id: string): Observable<ReceivableOrder> {
    return this.call(this.http.get<unknown>(`${this.url}/orders/${encodeURIComponent(id)}`));
  }

  list(query: PeListQuery): Observable<PagedResult<PeSummary>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 10);
    for (const key of [
      'search',
      'status',
      'supplierId',
      'purchaseOrderId',
      'from',
      'to',
    ] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    return this.call(this.http.get<unknown>(this.url, { params }));
  }

  get(id: string): Observable<PurchaseEntry> {
    return this.call(this.http.get<unknown>(`${this.url}/${encodeURIComponent(id)}`));
  }

  /** The entry's items as they are now, with the received quantity as label copies. */
  labels(id: string): Observable<PeLabelItem[]> {
    return this.call(this.http.get<unknown>(`${this.url}/${encodeURIComponent(id)}/labels`));
  }

  create(input: PeInput): Observable<PurchaseEntry> {
    return this.call(this.http.post<unknown>(this.url, input));
  }

  update(id: string, input: PeInput): Observable<PurchaseEntry> {
    return this.call(this.http.put<unknown>(`${this.url}/${encodeURIComponent(id)}`, input));
  }

  cancel(id: string): Observable<PurchaseEntry> {
    return this.call(this.http.post<unknown>(`${this.url}/${encodeURIComponent(id)}/cancel`, {}));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Purchase entries need the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

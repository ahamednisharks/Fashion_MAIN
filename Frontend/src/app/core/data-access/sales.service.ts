import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import {
  SaleInvoice,
  SaleInvoiceInput,
  SaleInvoiceSummary,
  SellableItem,
} from '../models/sale.model';
import { ApiError, PagedResult } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

export interface InvoiceListQuery {
  search?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** YYYY-MM-DD — bills on or after this date. */
  from?: string;
  /** YYYY-MM-DD — bills on or before this date. */
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Counter billing — REST API at /sales. Billing always needs the backend (bills must be numbered
 * and stored centrally), so in 'mock' mode every call fails with a clear message.
 */
@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/sales`;
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  /** Exact barcode / SKU / product code match (scanner). Empty when nothing matches. */
  lookup(code: string): Observable<SellableItem[]> {
    const params = new HttpParams().set('code', code.trim());
    return this.call(this.http.get<unknown>(`${this.url}/items/lookup`, { params }));
  }

  /** Active items matching every typed word. */
  search(text: string, limit = 20): Observable<SellableItem[]> {
    const params = new HttpParams().set('search', text.trim()).set('limit', limit);
    return this.call(this.http.get<unknown>(`${this.url}/items`, { params }));
  }

  createInvoice(input: SaleInvoiceInput): Observable<SaleInvoice> {
    return this.call(this.http.post<unknown>(`${this.url}/invoices`, input));
  }

  getInvoice(id: string): Observable<SaleInvoice> {
    return this.call(this.http.get<unknown>(`${this.url}/invoices/${encodeURIComponent(id)}`));
  }

  listInvoices(query: InvoiceListQuery): Observable<PagedResult<SaleInvoiceSummary>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);
    if (query.search) params = params.set('search', query.search);
    if (query.date) params = params.set('date', query.date);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    return this.call(this.http.get<unknown>(`${this.url}/invoices`, { params }));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Billing needs the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

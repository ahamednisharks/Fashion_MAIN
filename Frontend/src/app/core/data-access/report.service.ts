import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import {
  SalesReport,
  StockReport,
  StockReportExport,
  StockReportQuery,
} from '../models/report.model';
import { ApiError } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

/**
 * Reports — REST API at /reports (administrators only). Reports are computed from the stored
 * bills, so in 'mock' mode every call fails with a clear message.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/reports`;
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  /** Sales of a period (YYYY-MM-DD, both days included), day by day. */
  sales(from: string, to: string): Observable<SalesReport> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.call(this.http.get<unknown>(`${this.url}/sales`, { params }));
  }

  /** One page of the stock report: opening, in, out and closing stock per item. */
  stock(query: StockReportQuery): Observable<StockReport> {
    const params = stockParams(query)
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 25);
    return this.call(this.http.get<unknown>(`${this.url}/stock`, { params }));
  }

  /** The whole stock report (every matching item) for an Excel / PDF file. */
  stockExport(query: StockReportQuery): Observable<StockReportExport> {
    const params = stockParams(query);
    return this.call(this.http.get<unknown>(`${this.url}/stock/export`, { params }));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Reports need the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

function stockParams(query: StockReportQuery): HttpParams {
  let params = new HttpParams().set('from', query.from).set('to', query.to);
  for (const key of ['search', 'status', 'brandId', 'sizeId', 'colorId', 'stock'] as const) {
    const value = query[key];
    if (value) params = params.set(key, value);
  }
  if (query.sort) {
    params = params.set('sortBy', query.sort.field).set('sortOrder', query.sort.direction);
  }
  return params;
}

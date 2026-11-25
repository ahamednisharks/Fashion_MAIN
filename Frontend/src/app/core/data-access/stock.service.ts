import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { StockHistory, StockLevel } from '../models/stock.model';
import { ApiError } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

/**
 * Stock — REST API at /stock. The quantity in hand itself comes with every item (`stock`);
 * this service gives an item's movements, or the stock of several items at once. Needs the
 * backend: in 'mock' mode it fails clearly.
 */
@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/stock`;
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  /** The item's latest movements (newest first) with the balance after each. */
  history(productId: string, variantId: string | null, limit = 200): Observable<StockHistory> {
    let params = new HttpParams().set('productId', productId).set('limit', limit);
    if (variantId) params = params.set('variantId', variantId);
    return this.call(this.http.get<unknown>(`${this.url}/history`, { params }));
  }

  /** Quantity in hand of each item now, in the order given. */
  levels(
    items: readonly { productId: string; variantId: string | null }[],
  ): Observable<StockLevel[]> {
    const body = {
      items: items.map((item) => ({ productId: item.productId, variantId: item.variantId })),
    };
    return this.call(this.http.post<unknown>(`${this.url}/levels`, body));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Stock needs the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

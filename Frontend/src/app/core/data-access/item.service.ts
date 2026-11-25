import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import {
  BarcodeAssignment,
  BarcodeAssignmentInput,
  BarcodeFilter,
  BarcodeSettings,
  BarcodeSettingsInput,
  CatalogItem,
  ItemCounts,
} from '../models/item.model';
import { ApiError, PagedResult, SortState, StatusFilter } from './api.types';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { StockFilter } from '../models/stock.model';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

export interface ItemListQuery {
  search?: string;
  status?: StatusFilter;
  categoryId?: string;
  brandId?: string;
  sizeId?: string;
  colorId?: string;
  barcode?: BarcodeFilter | '';
  stock?: StockFilter | '';
  page?: number;
  pageSize?: number;
  sort?: SortState | null;
}

/**
 * Items (one per variant / product without variants), barcode assignment and label settings —
 * REST API at /items and /settings/barcodes. Needs the backend: in 'mock' mode every call fails
 * with a clear message.
 */
@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  readonly available = inject(DATA_SOURCE_MODE) === 'api';

  list(query: ItemListQuery): Observable<PagedResult<CatalogItem>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 10);
    for (const key of [
      'search',
      'status',
      'categoryId',
      'brandId',
      'sizeId',
      'colorId',
      'barcode',
      'stock',
    ] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    if (query.sort) {
      params = params.set('sortBy', query.sort.field).set('sortOrder', query.sort.direction);
    }
    return this.call(this.http.get<unknown>(`${this.base}/items`, { params }));
  }

  counts(): Observable<ItemCounts> {
    return this.call(this.http.get<unknown>(`${this.base}/items/counts`));
  }

  /** Saves barcodes (all or nothing). Errors name the row as `items.<n>.barcode`. */
  assignBarcodes(items: readonly BarcodeAssignmentInput[]): Observable<BarcodeAssignment[]> {
    return this.call(this.http.post<unknown>(`${this.base}/items/barcodes`, { items }));
  }

  settings(): Observable<BarcodeSettings> {
    return this.call(this.http.get<unknown>(`${this.base}/settings/barcodes`));
  }

  /** Administrators only. */
  saveSettings(input: BarcodeSettingsInput): Observable<BarcodeSettings> {
    return this.call(this.http.put<unknown>(`${this.base}/settings/barcodes`, input));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    if (!this.available) {
      return throwError(
        () =>
          new ApiError(
            'NETWORK',
            'Items and barcodes need the Fashion server. Switch the app to the API data source.',
          ),
      );
    }
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

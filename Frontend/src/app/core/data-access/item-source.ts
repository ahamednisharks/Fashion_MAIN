import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { SellableItem } from '../models/sale.model';

/**
 * Where the scan box (<app-item-search>) finds items. Billing uses SalesService by default; a
 * page can provide ITEM_SOURCE to search elsewhere (e.g. purchase orders, with purchase rates).
 */
export interface ItemSource<T extends SellableItem = SellableItem> {
  /** Exact barcode / SKU / product code match. Empty when nothing matches. */
  lookup(code: string): Observable<T[]>;
  /** Active items matching every typed word. */
  search(text: string, limit?: number): Observable<T[]>;
}

export const ITEM_SOURCE = new InjectionToken<ItemSource>('ITEM_SOURCE');

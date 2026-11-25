import { Injectable } from '@angular/core';

import { SellableItem } from '../../core/models/sale.model';

/** An item handed to Barcode Assign and how many labels to print for it. */
export interface LabelRequest {
  readonly item: SellableItem;
  readonly copies: number;
}

/**
 * Hands items chosen on another screen (ticked on the Items list, or received on a purchase
 * entry) to the Barcode Assign page, which takes them once when it opens.
 */
@Injectable({ providedIn: 'root' })
export class LabelQueue {
  private requests: readonly LabelRequest[] = [];

  /** `copies[i]` labels for `items[i]` (default 1). */
  put(items: readonly SellableItem[], copies: readonly number[] = []): void {
    this.requests = items.map((item, index) => ({ item, copies: copies[index] ?? 1 }));
  }

  take(): readonly LabelRequest[] {
    const requests = this.requests;
    this.requests = [];
    return requests;
  }
}

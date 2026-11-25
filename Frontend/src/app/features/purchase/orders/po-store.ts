import { Injectable, computed, signal } from '@angular/core';

import { PoInput, PurchasableItem, PurchaseOrder } from '../../../core/models/purchase-order.model';
import { checkQuantity, lineKey } from '../../billing/bill-store';
import { PoLineAmounts, PoTotals, calculatePo } from '../po-calculator';
import { PurchaseSupplier, poSupplyTypeFor } from '../shared/purchase-supplier';

export { MAX_QUANTITY, QUANTITY_MESSAGES } from '../../billing/bill-store';
export { poSupplyTypeFor, supplierAddress } from '../shared/purchase-supplier';

/** The supplier fields a PO needs (a full Supplier, or the snapshot of a saved PO). */
export type PoSupplierInfo = PurchaseSupplier;

export interface PoLine {
  /** productId|variantId — adding the same item again increases this line's quantity. */
  readonly key: string;
  readonly item: PurchasableItem;
  readonly quantity: number;
  /** GST-exclusive purchase rate; null until entered. */
  readonly rate: number | null;
  readonly discountPercent: number;
  /** Counts re-adds of the same item (drives the row highlight). */
  readonly bump: number;
}

export interface PoLineView extends PoLine {
  readonly amounts: PoLineAmounts;
  readonly taxAmount: number;
  /** Fabric is ordered by length, so its quantity may have decimals (metres). */
  readonly allowDecimals: boolean;
}

/** Rounds half up to 2 decimals, ignoring float noise (455.555 → 455.56, not 455.55). */
const twoDecimals = (value: number) => Math.round(Number((value * 100).toFixed(6))) / 100;

/** The purchase order being written or edited (one per form page). */
@Injectable()
export class PoStore {
  readonly shopState = signal('');
  readonly supplier = signal<PoSupplierInfo | null>(null);
  readonly poDate = signal('');
  readonly expectedDate = signal('');
  readonly notes = signal('');
  private readonly rawLines = signal<readonly PoLine[]>([]);
  /** The form as last loaded / saved, to detect unsaved changes. */
  private readonly savedSnapshot = signal('');

  readonly supplyType = computed(() => poSupplyTypeFor(this.shopState(), this.supplier()));

  readonly calculation = computed(() =>
    calculatePo(
      this.rawLines().map((line) => ({
        rate: line.rate ?? 0,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        gstRate: line.item.gstRate,
      })),
      this.supplyType(),
    ),
  );

  readonly lines = computed<PoLineView[]>(() => {
    const amounts = this.calculation().lines;
    return this.rawLines().map((line, index) => {
      const lineAmounts = amounts[index];
      return {
        ...line,
        amounts: lineAmounts,
        taxAmount:
          Math.round(
            (lineAmounts.cgstAmount + lineAmounts.sgstAmount + lineAmounts.igstAmount) * 100,
          ) / 100,
        allowDecimals: line.item.productType === 'fabric',
      };
    });
  });

  readonly totals = computed<PoTotals>(() => this.calculation().totals);
  readonly isEmpty = computed(() => this.rawLines().length === 0);
  /** Lines still waiting for a purchase rate. */
  readonly linesWithoutRate = computed(() =>
    this.rawLines().filter((line) => line.rate === null || line.rate <= 0),
  );

  /** Why the PO cannot be saved yet (first problem), or null. */
  readonly problem = computed<string | null>(() => {
    if (!this.supplier()) return 'Choose a supplier.';
    if (!this.poDate()) return 'Enter the PO date.';
    if (this.expectedDate() && this.expectedDate() < this.poDate()) {
      return 'Expected date cannot be before the PO date.';
    }
    if (this.isEmpty()) return 'Add at least one item.';
    const missing = this.linesWithoutRate();
    if (missing.length) {
      return missing.length === 1
        ? `Enter the rate of ${missing[0].item.productName}.`
        : `Enter the rate of ${missing.length} items.`;
    }
    return null;
  });

  readonly hasUnsavedChanges = computed(() => this.snapshot() !== this.savedSnapshot());

  // ---- Lines ---------------------------------------------------------------------------------------

  /** Adds an item, or one more of it when it is already on the PO. Returns the line key. */
  add(item: PurchasableItem): string {
    const key = lineKey(item);
    const existing = this.rawLines().find((line) => line.key === key);
    if (existing) {
      this.patch(key, { quantity: existing.quantity + 1, bump: existing.bump + 1 });
    } else {
      const rate = item.purchasePrice && item.purchasePrice > 0 ? item.purchasePrice : null;
      this.rawLines.update((lines) => [
        ...lines,
        { key, item, quantity: 1, rate, discountPercent: 0, bump: 0 },
      ]);
    }
    return key;
  }

  /** Sets a typed quantity; returns why it was refused (and keeps the old value). */
  setQuantity(key: string, quantity: number): string | null {
    const line = this.find(key);
    if (!line) return null;
    const problem = checkQuantity(line.item, quantity);
    if (problem) return problem;
    this.patch(key, { quantity });
    return null;
  }

  step(key: string, delta: 1 | -1): void {
    const line = this.find(key);
    if (line && !checkQuantity(line.item, line.quantity + delta)) {
      this.patch(key, { quantity: Math.round((line.quantity + delta) * 1000) / 1000 });
    }
  }

  /** Sets a typed rate (null = cleared); returns an error message or null. */
  setRate(key: string, rate: number | null): string | null {
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
      return 'Rate must be more than 0.';
    }
    if (rate !== null && rate > 9_999_999.99) {
      return 'Rate cannot be more than ₹99,99,999.99.';
    }
    this.patch(key, { rate: rate === null ? null : twoDecimals(rate) });
    return null;
  }

  setDiscount(key: string, percent: number): string | null {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return 'Discount must be between 0 and 100%.';
    }
    this.patch(key, { discountPercent: twoDecimals(percent) });
    return null;
  }

  remove(key: string): void {
    this.rawLines.update((lines) => lines.filter((line) => line.key !== key));
  }

  // ---- Load / save ---------------------------------------------------------------------------------

  /** Starts a new PO dated `today`. */
  reset(today: string): void {
    this.supplier.set(null);
    this.poDate.set(today);
    this.expectedDate.set('');
    this.notes.set('');
    this.rawLines.set([]);
    this.markSaved();
  }

  /** Loads a saved PO for editing (items keep the rates of the PO). */
  load(po: PurchaseOrder): void {
    this.supplier.set({
      id: po.supplierId,
      name: po.supplierName,
      mobile: po.supplierMobile,
      gstNumber: po.supplierGstNumber,
      state: po.supplierState,
      address: po.supplierAddress,
      // Only active suppliers can be chosen; the PO's own supplier may stay as it is.
      status: 'active',
    });
    this.poDate.set(po.poDate);
    this.expectedDate.set(po.expectedDate ?? '');
    this.notes.set(po.notes);
    this.rawLines.set(
      po.items.map((item) => ({
        key: lineKey(item),
        item: {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          productCode: item.productCode,
          productType: item.productType,
          brandName: '',
          designNo: item.designNo,
          sizeName: item.sizeName,
          colorName: item.colorName,
          colorHex: '',
          sku: item.sku,
          barcode: item.barcode,
          hsnCode: item.hsnCode,
          gstRate: item.gstRate,
          mrp: 0,
          unitPrice: 0,
          status: 'active',
          purchasePrice: item.rate,
        },
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
        bump: 0,
      })),
    );
    this.markSaved();
  }

  markSaved(): void {
    this.savedSnapshot.set(this.snapshot());
  }

  /** Request body (call only when problem() is null). */
  toInput(): PoInput {
    return {
      supplierId: this.supplier()?.id ?? '',
      poDate: this.poDate(),
      expectedDate: this.expectedDate() || null,
      notes: this.notes().trim(),
      items: this.rawLines().map((line) => ({
        productId: line.item.productId,
        variantId: line.item.variantId,
        quantity: line.quantity,
        rate: line.rate ?? 0,
        discountPercent: line.discountPercent,
      })),
    };
  }

  private snapshot(): string {
    return JSON.stringify(this.toInput());
  }

  private find(key: string): PoLine | undefined {
    return this.rawLines().find((line) => line.key === key);
  }

  private patch(key: string, changes: Partial<PoLine>): void {
    this.rawLines.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }
}

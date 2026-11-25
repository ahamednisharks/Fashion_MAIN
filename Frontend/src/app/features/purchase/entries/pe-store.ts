import { Injectable, computed, signal } from '@angular/core';

import { PeInput, PurchaseEntry, ReceivableOrder } from '../../../core/models/purchase-entry.model';
import { PurchasableItem } from '../../../core/models/purchase-order.model';
import { checkQuantity, lineKey } from '../../billing/bill-store';
import { PoLineAmounts, PoTotals, calculatePo } from '../po-calculator';
import { PurchaseSupplier, poSupplyTypeFor } from '../shared/purchase-supplier';

export { MAX_QUANTITY, QUANTITY_MESSAGES } from '../../billing/bill-store';

const MAX_MONEY = 9_999_999.99;

export interface PeLine {
  /** productId|variantId — adding the same item again increases this line's quantity. */
  readonly key: string;
  readonly item: PurchasableItem;
  readonly quantity: number;
  /** GST-exclusive purchase rate; null until entered. */
  readonly rate: number | null;
  readonly discountPercent: number;
  /** MRP to give the item (GST inclusive); null until entered. */
  readonly mrp: number | null;
  /** Selling price to give the item (GST inclusive); null until entered. */
  readonly sellingPrice: number | null;
  /** Counts re-adds of the same item (drives the row highlight). */
  readonly bump: number;
}

export interface PeLineView extends PeLine {
  readonly amounts: PoLineAmounts;
  readonly taxAmount: number;
  /** Fabric comes in metres, so its quantity may have decimals. */
  readonly allowDecimals: boolean;
  /** Quantity on the chosen PO (null = no PO, or the item is not on it). */
  readonly ordered: number | null;
  /** Still to come on the PO for this entry (null = not on the PO). */
  readonly pending: number | null;
  /** Received beyond what is still to come (0 when within the PO). */
  readonly over: number;
  /** Margin on the selling price before GST, in % (null when it cannot be worked out). */
  readonly margin: number | null;
  /** Why the MRP / selling price cannot be saved, or null. */
  readonly priceProblem: string | null;
}

/** Rounds half up to 2 decimals, ignoring float noise (455.555 → 455.56, not 455.55). */
const twoDecimals = (value: number) => Math.round(Number((value * 100).toFixed(6))) / 100;
const threeDecimals = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Margin on the selling price: (selling price without GST − net cost) ÷ selling price without
 * GST. Net cost is the GST-exclusive rate after the line discount.
 */
export function marginPercent(
  line: Pick<PeLine, 'rate' | 'discountPercent' | 'sellingPrice'>,
  gstRate: number,
): number | null {
  if (!line.rate || !line.sellingPrice) {
    return null;
  }
  const sellingWithoutGst = line.sellingPrice / (1 + gstRate / 100);
  const cost = line.rate * (1 - line.discountPercent / 100);
  return Math.round(((sellingWithoutGst - cost) / sellingWithoutGst) * 1000) / 10;
}

function priceProblem(line: Pick<PeLine, 'mrp' | 'sellingPrice'>): string | null {
  if (line.mrp === null) return 'Enter the MRP.';
  if (line.sellingPrice === null) return 'Enter the selling price.';
  if (line.sellingPrice > line.mrp) return 'Selling price cannot be more than the MRP.';
  return null;
}

/** The purchase entry being written or edited (one per form page). */
@Injectable()
export class PeStore {
  readonly shopState = signal('');
  readonly supplier = signal<PurchaseSupplier | null>(null);
  readonly entryDate = signal('');
  readonly invoiceNo = signal('');
  readonly invoiceDate = signal('');
  /** Total printed on the supplier's invoice (optional). */
  readonly billAmount = signal<number | null>(null);
  readonly notes = signal('');
  /** The PO received against (null = direct purchase). */
  readonly order = signal<ReceivableOrder | null>(null);
  private readonly rawLines = signal<readonly PeLine[]>([]);
  /**
   * When editing: the PO the entry was saved against and its quantities there. The PO's
   * received quantities include them, so for this entry they are still "to come".
   */
  private readonly own = signal<{ orderId: string; quantities: ReadonlyMap<string, number> }>({
    orderId: '',
    quantities: new Map(),
  });
  /** The form as last loaded / saved, to detect unsaved changes. */
  private readonly savedSnapshot = signal('');

  readonly supplyType = computed(() => poSupplyTypeFor(this.shopState(), this.supplier()));

  /** PO lines by item key, with what is still to come for this entry. */
  private readonly orderLines = computed(() => {
    const order = this.order();
    const own = this.own();
    const map = new Map<string, { ordered: number; pending: number }>();
    for (const line of order?.items ?? []) {
      const key = lineKey(line);
      const mine = own.orderId === order?.id ? (own.quantities.get(key) ?? 0) : 0;
      map.set(key, {
        ordered: line.orderedQuantity,
        pending: Math.max(0, threeDecimals(line.orderedQuantity - line.receivedQuantity + mine)),
      });
    }
    return map;
  });

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

  readonly lines = computed<PeLineView[]>(() => {
    const amounts = this.calculation().lines;
    const onOrder = this.orderLines();
    return this.rawLines().map((line, index) => {
      const lineAmounts = amounts[index];
      const po = onOrder.get(line.key);
      return {
        ...line,
        amounts: lineAmounts,
        taxAmount: twoDecimals(
          lineAmounts.cgstAmount + lineAmounts.sgstAmount + lineAmounts.igstAmount,
        ),
        allowDecimals: line.item.productType === 'fabric',
        ordered: po?.ordered ?? null,
        pending: po?.pending ?? null,
        over: po ? Math.max(0, threeDecimals(line.quantity - po.pending)) : 0,
        margin: marginPercent(line, line.item.gstRate),
        priceProblem: priceProblem(line),
      };
    });
  });

  readonly totals = computed<PoTotals>(() => this.calculation().totals);
  readonly isEmpty = computed(() => this.rawLines().length === 0);
  /** Lines received beyond the PO. */
  readonly overLines = computed(() => this.lines().filter((line) => line.over > 0));
  /** Lines not on the chosen PO. */
  readonly offOrderLines = computed(() =>
    this.order() ? this.lines().filter((line) => line.ordered === null) : [],
  );
  /** Supplier's bill total minus the computed total (null when no bill total was typed). */
  readonly billDifference = computed(() => {
    const bill = this.billAmount();
    return bill === null ? null : twoDecimals(bill - this.totals().grandTotal);
  });

  /** Why the entry cannot be saved yet (first problem), or null. */
  readonly problem = computed<string | null>(() => {
    if (!this.supplier()) return 'Choose a supplier.';
    if (!this.invoiceNo().trim()) return "Enter the supplier's invoice number.";
    if (!this.invoiceDate()) return 'Enter the supplier invoice date.';
    if (!this.entryDate()) return 'Enter the received date.';
    if (this.invoiceDate() > this.entryDate()) {
      return 'The supplier invoice date cannot be after the received date.';
    }
    if (this.isEmpty()) return 'Add at least one item.';
    const lines = this.lines();
    const withoutRate = lines.filter((line) => line.rate === null || line.rate <= 0);
    if (withoutRate.length) {
      return withoutRate.length === 1
        ? `Enter the rate of ${withoutRate[0].item.productName}.`
        : `Enter the rate of ${withoutRate.length} items.`;
    }
    const badPrice = lines.find((line) => line.priceProblem);
    if (badPrice) {
      return `${badPrice.item.productName}: ${badPrice.priceProblem}`;
    }
    return null;
  });

  readonly hasUnsavedChanges = computed(() => this.snapshot() !== this.savedSnapshot());

  // ---- Lines ---------------------------------------------------------------------------------------

  /** Adds an item, or one more of it when it is already on the entry. Returns the line key. */
  add(item: PurchasableItem): string {
    const key = lineKey(item);
    const existing = this.rawLines().find((line) => line.key === key);
    if (existing) {
      this.patch(key, { quantity: existing.quantity + 1, bump: existing.bump + 1 });
    } else {
      this.rawLines.update((lines) => [...lines, newLine(item, 1)]);
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
      this.patch(key, { quantity: threeDecimals(line.quantity + delta) });
    }
  }

  /** Sets a typed rate (null = cleared); returns an error message or null. */
  setRate(key: string, rate: number | null): string | null {
    const problem = moneyProblem(rate, 'Rate', true);
    if (problem) return problem;
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

  setMrp(key: string, mrp: number | null): string | null {
    const problem = moneyProblem(mrp, 'MRP', false);
    if (problem) return problem;
    this.patch(key, { mrp: mrp === null ? null : twoDecimals(mrp) });
    return null;
  }

  setSellingPrice(key: string, price: number | null): string | null {
    const problem = moneyProblem(price, 'Selling price', false);
    if (problem) return problem;
    this.patch(key, { sellingPrice: price === null ? null : twoDecimals(price) });
    return null;
  }

  remove(key: string): void {
    this.rawLines.update((lines) => lines.filter((line) => line.key !== key));
  }

  /** Takes every line off the entry (before loading another PO's items). */
  clearLines(): void {
    this.rawLines.set([]);
  }

  // ---- Purchase order ------------------------------------------------------------------------------

  /**
   * Receives against `order` (null = direct purchase). With `addPending`, the PO's items still
   * to come that are not on the entry yet are added with the PO's rate and discount. Returns
   * how many lines were added.
   */
  setOrder(order: ReceivableOrder | null, addPending = true): number {
    this.order.set(order);
    if (!order || !addPending) {
      return 0;
    }
    const present = new Set(this.rawLines().map((line) => line.key));
    const pending = this.orderLines();
    const added: PeLine[] = [];
    for (const item of order.items) {
      const key = lineKey(item);
      const toCome = pending.get(key)?.pending ?? 0;
      if (present.has(key) || toCome <= 0) continue;
      added.push({
        ...newLine(item, toCome),
        rate: item.rate > 0 ? item.rate : null,
        discountPercent: item.discountPercent,
      });
    }
    if (added.length) {
      this.rawLines.update((lines) => [...lines, ...added]);
    }
    return added.length;
  }

  // ---- Load / save ---------------------------------------------------------------------------------

  /** Starts a new entry received `today`. */
  reset(today: string): void {
    this.supplier.set(null);
    this.entryDate.set(today);
    this.invoiceNo.set('');
    this.invoiceDate.set(today);
    this.billAmount.set(null);
    this.notes.set('');
    this.order.set(null);
    this.own.set({ orderId: '', quantities: new Map() });
    this.rawLines.set([]);
    this.markSaved();
  }

  /** Loads a saved entry for editing, with its PO (as items to receive) when it has one. */
  load(entry: PurchaseEntry, order: ReceivableOrder | null): void {
    this.supplier.set({
      id: entry.supplierId,
      name: entry.supplierName,
      mobile: entry.supplierMobile,
      gstNumber: entry.supplierGstNumber,
      state: entry.supplierState,
      address: entry.supplierAddress,
      // Only active suppliers can be chosen; the entry's own supplier may stay as it is.
      status: 'active',
    });
    this.entryDate.set(entry.entryDate);
    this.invoiceNo.set(entry.supplierInvoiceNo);
    this.invoiceDate.set(entry.supplierInvoiceDate);
    this.billAmount.set(entry.billAmount);
    this.notes.set(entry.notes);
    this.own.set({
      orderId: entry.purchaseOrderId ?? '',
      quantities: new Map(entry.items.map((item) => [lineKey(item), item.quantity])),
    });
    this.order.set(order);
    this.rawLines.set(
      entry.items.map((item) => ({
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
          mrp: item.mrp,
          unitPrice: item.sellingPrice,
          status: 'active',
          purchasePrice: item.rate,
        },
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
        mrp: item.mrp,
        sellingPrice: item.sellingPrice,
        bump: 0,
      })),
    );
    this.markSaved();
  }

  markSaved(): void {
    this.savedSnapshot.set(this.snapshot());
  }

  /** Request body (call only when problem() is null). */
  toInput(): PeInput {
    return {
      supplierId: this.supplier()?.id ?? '',
      purchaseOrderId: this.order()?.id ?? null,
      supplierInvoiceNo: this.invoiceNo().trim(),
      supplierInvoiceDate: this.invoiceDate(),
      entryDate: this.entryDate(),
      billAmount: this.billAmount(),
      notes: this.notes().trim(),
      items: this.rawLines().map((line) => ({
        productId: line.item.productId,
        variantId: line.item.variantId,
        quantity: line.quantity,
        rate: line.rate ?? 0,
        discountPercent: line.discountPercent,
        mrp: line.mrp,
        sellingPrice: line.sellingPrice,
      })),
    };
  }

  private snapshot(): string {
    return JSON.stringify(this.toInput());
  }

  private find(key: string): PeLine | undefined {
    return this.rawLines().find((line) => line.key === key);
  }

  private patch(key: string, changes: Partial<PeLine>): void {
    this.rawLines.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }
}

/** A new line priced from the item: its purchase rate, MRP and selling price as they are now. */
function newLine(item: PurchasableItem, quantity: number): PeLine {
  return {
    key: lineKey(item),
    item,
    quantity,
    rate: item.purchasePrice && item.purchasePrice > 0 ? item.purchasePrice : null,
    discountPercent: 0,
    mrp: item.mrp,
    sellingPrice: item.unitPrice,
    bump: 0,
  };
}

/** Money typed into a line box: null clears it; `positive` refuses 0. */
function moneyProblem(value: number | null, label: string, positive: boolean): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    return positive ? `${label} must be more than 0.` : `${label} cannot be negative.`;
  }
  if (value > MAX_MONEY) return `${label} cannot be more than ₹99,99,999.99.`;
  return null;
}

import { Injectable, computed, signal } from '@angular/core';

import { Customer } from '../../core/models/customer.model';
import {
  PaymentMode,
  SaleInvoiceInput,
  SalePaymentInput,
  SellableItem,
  SupplyType,
} from '../../core/models/sale.model';
import { stateFromGstin } from '../../core/utils/gstin';
import {
  BillLineAmounts,
  BillTotals,
  PaymentSettlement,
  calculateBill,
  settlePayments,
} from './bill-calculator';

/** Same limits as the API. */
export const MAX_QUANTITY = 9999;
export const QUANTITY_DECIMALS = 3;

export type PaymentChoice = PaymentMode | 'split';

export interface BillLine {
  /** productId|variantId — adding the same item again increases this line's quantity. */
  readonly key: string;
  readonly item: SellableItem;
  readonly quantity: number;
  readonly discountPercent: number;
  /** Counts re-adds of the same item (drives the row highlight). */
  readonly bump: number;
}

export interface BillLineView extends BillLine {
  readonly amounts: BillLineAmounts;
  /** GST included in the line amount (CGST + SGST, or IGST). */
  readonly taxAmount: number;
  /** Fabric is sold by length, so its quantity may have decimals (metres). */
  readonly allowDecimals: boolean;
}

export type QuantityProblem = 'invalid' | 'whole-number' | 'too-many-decimals' | 'too-large';

export const QUANTITY_MESSAGES: Readonly<Record<QuantityProblem, string>> = {
  invalid: 'Quantity must be more than 0.',
  'whole-number': 'Quantity must be a whole number for this item (decimals are only for fabric).',
  'too-many-decimals': `Quantity can have at most ${QUANTITY_DECIMALS} decimal places.`,
  'too-large': `Quantity cannot be more than ${MAX_QUANTITY}.`,
};

export function lineKey(item: Pick<SellableItem, 'productId' | 'variantId'>): string {
  return `${item.productId}|${item.variantId ?? ''}`;
}

export function checkQuantity(item: SellableItem, quantity: number): QuantityProblem | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return 'invalid';
  if (quantity > MAX_QUANTITY) return 'too-large';
  if (item.productType !== 'fabric' && !Number.isInteger(quantity)) return 'whole-number';
  const factor = 10 ** QUANTITY_DECIMALS;
  if (Math.abs(Math.round(quantity * factor) - quantity * factor) > 1e-6) {
    return 'too-many-decimals';
  }
  return null;
}

/**
 * IGST when a registered (GSTIN) customer is from another state than the shop; otherwise
 * CGST + SGST. Mirrors supplyTypeFor() in the backend sales service.
 */
export function supplyTypeFor(shopState: string, customer: Customer | null): SupplyType {
  if (!customer?.gstNumber || !shopState) {
    return 'intra';
  }
  const customerState = stateFromGstin(customer.gstNumber)?.name ?? customer.state;
  return customerState && customerState !== shopState ? 'inter' : 'intra';
}

/** The bill being prepared at the counter (one per billing page). */
@Injectable()
export class BillStore {
  private readonly lineList = signal<readonly BillLine[]>([]);

  readonly customer = signal<Customer | null>(null);
  /** Shop state from the shop profile (decides CGST + SGST vs IGST). */
  readonly shopState = signal('');

  readonly paymentChoice = signal<PaymentChoice>('cash');
  /** Cash handed over by the customer; null = exact amount. */
  readonly cashTendered = signal<number | null>(null);
  /** UPI transaction ID / card last digits for single UPI or card payments. */
  readonly paymentReference = signal('');
  readonly splitAmounts = signal<Readonly<Record<PaymentMode, number | null>>>({
    cash: null,
    upi: null,
    card: null,
  });

  /** Key of the line touched most recently (scrolled into view and highlighted). */
  readonly lastTouchedKey = signal<string | null>(null);

  readonly supplyType = computed(() => supplyTypeFor(this.shopState(), this.customer()));

  private readonly calculation = computed(() =>
    calculateBill(
      this.lineList().map((line) => ({
        unitPrice: line.item.unitPrice,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        gstRate: line.item.gstRate,
      })),
      this.supplyType(),
    ),
  );

  readonly lines = computed<readonly BillLineView[]>(() => {
    const amounts = this.calculation().lines;
    return this.lineList().map((line, index) => {
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

  readonly totals = computed<BillTotals>(() => this.calculation().totals);
  readonly isEmpty = computed(() => this.lineList().length === 0);

  readonly payments = computed<SalePaymentInput[]>(() => {
    const total = this.totals().grandTotal;
    const choice = this.paymentChoice();
    if (choice === 'split') {
      const amounts = this.splitAmounts();
      return (['cash', 'upi', 'card'] as const)
        .filter((mode) => (amounts[mode] ?? 0) > 0)
        .map((mode) => ({ mode, amount: amounts[mode] ?? 0, reference: '' }));
    }
    if (total <= 0) {
      return [];
    }
    if (choice === 'cash') {
      return [{ mode: 'cash', amount: this.cashTendered() ?? total, reference: '' }];
    }
    return [{ mode: choice, amount: total, reference: this.paymentReference().trim() }];
  });

  readonly settlement = computed<PaymentSettlement>(() =>
    settlePayments(this.payments(), this.totals().grandTotal),
  );

  /** Amount still to be collected in split mode (0 when covered). */
  readonly splitRemaining = computed(() => {
    const paid = this.payments().reduce((sum, payment) => sum + payment.amount * 100, 0);
    return Math.max(0, Math.round(this.totals().grandTotal * 100 - paid)) / 100;
  });

  /**
   * Adds one unit of the item. The same item again increases the existing line's quantity
   * instead of adding a new line. Returns false when the quantity limit is reached.
   */
  add(item: SellableItem): { merged: boolean; added: boolean } {
    const key = lineKey(item);
    const existing = this.lineList().find((line) => line.key === key);
    this.lastTouchedKey.set(key);
    if (!existing) {
      this.lineList.update((lines) => [
        ...lines,
        { key, item, quantity: 1, discountPercent: 0, bump: 0 },
      ]);
      return { merged: false, added: true };
    }
    if (existing.quantity + 1 > MAX_QUANTITY) {
      return { merged: true, added: false };
    }
    this.patch(key, (line) => ({ quantity: line.quantity + 1, bump: line.bump + 1 }));
    return { merged: true, added: true };
  }

  /** Sets a line's quantity; returns the problem when the value is not allowed. */
  setQuantity(key: string, quantity: number): QuantityProblem | null {
    const line = this.lineList().find((candidate) => candidate.key === key);
    if (!line) {
      return null;
    }
    const problem = checkQuantity(line.item, quantity);
    if (!problem) {
      this.patch(key, () => ({ quantity }));
    }
    return problem;
  }

  /** +1 / −1 (never below 1 — use remove() to delete the line). */
  step(key: string, delta: 1 | -1): void {
    const line = this.lineList().find((candidate) => candidate.key === key);
    if (!line) {
      return;
    }
    const next = Math.round((line.quantity + delta) * 1000) / 1000;
    if (next >= 1 && next <= MAX_QUANTITY) {
      this.patch(key, () => ({ quantity: next }));
    }
  }

  /** Discount percent, clamped to 0–100 with at most 2 decimals. */
  setDiscount(key: string, percent: number): void {
    const value = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    this.patch(key, () => ({ discountPercent: Math.round(value * 100) / 100 }));
  }

  remove(key: string): void {
    this.lineList.update((lines) => lines.filter((line) => line.key !== key));
  }

  /** Replaces the item data of matching lines (e.g. after a price change on the server). */
  refreshItems(items: readonly SellableItem[]): number {
    let changed = 0;
    const byKey = new Map(items.map((item) => [lineKey(item), item]));
    this.lineList.update((lines) =>
      lines.map((line) => {
        const fresh = byKey.get(line.key);
        if (!fresh) return line;
        changed++;
        return { ...line, item: fresh };
      }),
    );
    return changed;
  }

  setSplitAmount(mode: PaymentMode, amount: number | null): void {
    this.splitAmounts.update((amounts) => ({ ...amounts, [mode]: amount }));
  }

  /** Starts a new bill. */
  clear(): void {
    this.lineList.set([]);
    this.customer.set(null);
    this.paymentChoice.set('cash');
    this.cashTendered.set(null);
    this.paymentReference.set('');
    this.splitAmounts.set({ cash: null, upi: null, card: null });
    this.lastTouchedKey.set(null);
  }

  toInput(): SaleInvoiceInput {
    return {
      customerId: this.customer()?.id ?? null,
      items: this.lineList().map((line) => ({
        productId: line.item.productId,
        variantId: line.item.variantId,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        unitPrice: line.item.unitPrice,
      })),
      payments: this.payments(),
    };
  }

  private patch(key: string, change: (line: BillLine) => Partial<BillLine>): void {
    this.lineList.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...change(line) } : line)),
    );
  }
}

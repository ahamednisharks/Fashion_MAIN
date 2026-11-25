import { Injectable, computed, signal } from '@angular/core';

import { PurchasableItem } from '../../core/models/purchase-order.model';
import {
  ADJUSTMENT_DIRECTION,
  ADJUSTMENT_REASON_LABELS,
  ADJUSTMENT_REASON_MODES,
  AdjustmentInput,
  AdjustmentMode,
  AdjustmentReason,
} from '../../core/models/stock-adjustment.model';
import { StockLevel } from '../../core/models/stock.model';
import { MAX_QUANTITY, QUANTITY_DECIMALS, lineKey } from '../billing/bill-store';

export { MAX_QUANTITY } from '../billing/bill-store';

/** A stock count can cover a whole category (the server allows as many lines). */
export const MAX_ADJUSTMENT_LINES = 1000;
const MAX_MONEY = 9_999_999.99;

export interface AdjLine {
  /** productId|variantId — scanning the same item again counts one more. */
  readonly key: string;
  readonly item: PurchasableItem;
  /** In stock as shown (when the item was added, or refreshed after a refused save). */
  readonly stock: number;
  /** The stock shown before a refresh changed it (null = unchanged). */
  readonly previousStock: number | null;
  /** Count mode: the quantity counted; null until entered. */
  readonly counted: number | null;
  /** Add / remove mode: + in, − out; null until entered. */
  readonly change: number | null;
  /** Cost of one piece (GST exclusive); null = not known. */
  readonly unitCost: number | null;
  readonly note: string;
  /** Counts re-scans of the same item (drives the row highlight). */
  readonly bump: number;
}

export interface AdjLineView extends AdjLine {
  /** Change to stock (null until the quantity is entered). */
  readonly difference: number | null;
  /** Stock after the adjustment (null until the quantity is entered). */
  readonly after: number | null;
  /** difference × unit cost (null when either is not known). */
  readonly value: number | null;
  /** Fabric is counted in metres, so decimals are allowed. */
  readonly allowDecimals: boolean;
  /** Why this line cannot be saved with the chosen reason, or null. */
  readonly problem: string | null;
}

export interface AdjTotals {
  itemCount: number;
  /** Lines whose quantity has been entered. */
  enteredCount: number;
  quantityIn: number;
  quantityOut: number;
  valueIn: number;
  valueOut: number;
  /** Lines that change stock but have no cost (not in the values). */
  withoutCost: number;
}

const twoDecimals = (value: number) => Math.round(Number((value * 100).toFixed(6))) / 100;
const threeDecimals = (value: number) => Math.round(Number((value * 1000).toFixed(6))) / 1000;

/** Why a typed quantity cannot be used for the item, or null. */
export function quantityProblem(
  item: PurchasableItem,
  value: number,
  options: { allowNegative: boolean },
): string | null {
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (!options.allowNegative && value < 0) return 'The counted quantity cannot be negative.';
  if (Math.abs(value) > MAX_QUANTITY) return `Quantity cannot be more than ${MAX_QUANTITY}.`;
  if (item.productType !== 'fabric' && !Number.isInteger(value)) {
    return 'Quantity must be a whole number for this item (decimals are only for fabric).';
  }
  const factor = 10 ** QUANTITY_DECIMALS;
  if (Math.abs(Math.round(value * factor) - value * factor) > 1e-6) {
    return `Quantity can have at most ${QUANTITY_DECIMALS} decimal places.`;
  }
  return null;
}

/**
 * The stock adjustment being written (one per form page). In count mode a scan counts one more
 * piece; in add / remove mode it adds one (or takes one out, for damaged / lost goods).
 */
@Injectable()
export class AdjustmentStore {
  readonly date = signal('');
  readonly reason = signal<AdjustmentReason>('stock_count');
  readonly mode = signal<AdjustmentMode>('count');
  readonly notes = signal('');
  private readonly rawLines = signal<readonly AdjLine[]>([]);
  /** The form as last started / saved, to detect unsaved changes. */
  private readonly savedSnapshot = signal('');

  /** + or − for a scan in add / remove mode. */
  readonly scanStep = computed<1 | -1>(() =>
    ADJUSTMENT_DIRECTION[this.reason()] === 'out' ? -1 : 1,
  );

  readonly lines = computed<AdjLineView[]>(() => {
    const mode = this.mode();
    const direction = ADJUSTMENT_DIRECTION[this.reason()];
    const reasonLabel = ADJUSTMENT_REASON_LABELS[this.reason()];
    return this.rawLines().map((line) => {
      const difference =
        mode === 'count'
          ? line.counted === null
            ? null
            : threeDecimals(line.counted - line.stock)
          : line.change;
      let problem: string | null = null;
      if (difference !== null && direction === 'out' && difference > 0) {
        problem = `${reasonLabel} goods can only be taken out of stock.`;
      } else if (difference !== null && direction === 'in' && difference < 0) {
        problem = `${reasonLabel} goods can only be added to stock.`;
      }
      return {
        ...line,
        difference,
        after: difference === null ? null : threeDecimals(line.stock + difference),
        value:
          difference === null || line.unitCost === null
            ? null
            : twoDecimals(difference * line.unitCost),
        allowDecimals: line.item.productType === 'fabric',
        problem,
      };
    });
  });

  readonly totals = computed<AdjTotals>(() => {
    const totals: AdjTotals = {
      itemCount: 0,
      enteredCount: 0,
      quantityIn: 0,
      quantityOut: 0,
      valueIn: 0,
      valueOut: 0,
      withoutCost: 0,
    };
    for (const line of this.lines()) {
      totals.itemCount += 1;
      if (line.difference === null) continue;
      totals.enteredCount += 1;
      if (line.difference > 0) totals.quantityIn += line.difference;
      if (line.difference < 0) totals.quantityOut -= line.difference;
      if (line.value !== null) {
        if (line.value > 0) totals.valueIn += line.value;
        if (line.value < 0) totals.valueOut -= line.value;
      } else if (line.difference !== 0) {
        totals.withoutCost += 1;
      }
    }
    return {
      ...totals,
      quantityIn: threeDecimals(totals.quantityIn),
      quantityOut: threeDecimals(totals.quantityOut),
      valueIn: twoDecimals(totals.valueIn),
      valueOut: twoDecimals(totals.valueOut),
    };
  });

  readonly isEmpty = computed(() => this.rawLines().length === 0);
  /** Lines whose stock changed when it was refreshed. */
  readonly changedStockLines = computed(() =>
    this.lines().filter((line) => line.previousStock !== null),
  );

  /** Why the adjustment cannot be saved yet (first problem), or null. */
  readonly problem = computed<string | null>(() => {
    if (!this.date()) return 'Enter the date.';
    if (this.isEmpty()) return 'Add at least one item.';
    const lines = this.lines();
    const missing = lines.filter((line) =>
      this.mode() === 'count' ? line.counted === null : !line.change,
    );
    if (missing.length) {
      const what =
        this.mode() === 'count' ? 'the counted quantity' : 'the quantity to add or take out';
      return missing.length === 1
        ? `Enter ${what} of ${missing[0].item.productName}.`
        : `Enter ${what} of ${missing.length} items.`;
    }
    const wrongWay = lines.find((line) => line.problem);
    if (wrongWay) {
      return `${wrongWay.item.productName}: ${wrongWay.problem} Choose another reason (e.g. Stock count).`;
    }
    if (this.reason() === 'other' && !this.notes().trim()) {
      return 'Write in the notes what this adjustment is for.';
    }
    return null;
  });

  readonly hasUnsavedChanges = computed(() => this.snapshot() !== this.savedSnapshot());

  // ---- Reason / mode -----------------------------------------------------------------------------

  /** Picks the reason and its usual way of entering quantities. */
  setReason(reason: AdjustmentReason): void {
    this.reason.set(reason);
    this.setMode(ADJUSTMENT_REASON_MODES[reason]);
  }

  /**
   * Switches between count and add / remove, keeping what was entered: a count becomes the
   * change it makes, and a change becomes the count it leads to.
   */
  setMode(mode: AdjustmentMode): void {
    if (mode === this.mode()) return;
    this.mode.set(mode);
    this.rawLines.update((lines) =>
      lines.map((line) => {
        if (mode === 'change') {
          const change = line.counted === null ? null : threeDecimals(line.counted - line.stock);
          return { ...line, change: change === 0 ? null : change };
        }
        const counted = line.change === null ? null : threeDecimals(line.stock + line.change);
        return { ...line, counted: counted !== null && counted >= 0 ? counted : null };
      }),
    );
  }

  // ---- Lines ---------------------------------------------------------------------------------------

  /**
   * Adds a scanned / searched item, or counts one more of it when it is already on the list.
   * Returns the line key, or null when the list is full.
   */
  add(item: PurchasableItem): string | null {
    const key = lineKey(item);
    const existing = this.find(key);
    if (existing) {
      this.patch(key, { ...this.stepped(existing, this.scanStepFor()), bump: existing.bump + 1 });
      return key;
    }
    if (this.rawLines().length >= MAX_ADJUSTMENT_LINES) return null;
    const line = newLine(item);
    this.rawLines.update((lines) => [
      ...lines,
      { ...line, ...this.stepped(line, this.scanStepFor()) },
    ]);
    return key;
  }

  /**
   * Adds items without a quantity (to count / enter one by one). Items already on the list are
   * left as they are. Returns how many were added.
   */
  addMany(items: readonly PurchasableItem[]): number {
    const present = new Set(this.rawLines().map((line) => line.key));
    const room = MAX_ADJUSTMENT_LINES - present.size;
    const added: AdjLine[] = [];
    for (const item of items) {
      const key = lineKey(item);
      if (present.has(key) || added.length >= room) continue;
      present.add(key);
      added.push(newLine(item));
    }
    if (added.length) {
      this.rawLines.update((lines) => [...lines, ...added]);
    }
    return added.length;
  }

  /** Sets a typed counted quantity (null = cleared); returns why it was refused, or null. */
  setCounted(key: string, value: number | null): string | null {
    const line = this.find(key);
    if (!line) return null;
    if (value !== null) {
      const problem = quantityProblem(line.item, value, { allowNegative: false });
      if (problem) return problem;
    }
    this.patch(key, { counted: value === null ? null : threeDecimals(value) });
    return null;
  }

  /** Sets a typed change (+ in, − out; null = cleared); returns why it was refused, or null. */
  setChange(key: string, value: number | null): string | null {
    const line = this.find(key);
    if (!line) return null;
    if (value !== null) {
      if (value === 0) return 'Enter + to add or − to take out (not 0).';
      const problem = quantityProblem(line.item, value, { allowNegative: true });
      if (problem) return problem;
    }
    this.patch(key, { change: value === null ? null : threeDecimals(value) });
    return null;
  }

  /** One more / one less (the − / + buttons). */
  step(key: string, delta: 1 | -1): void {
    const line = this.find(key);
    if (line) this.patch(key, this.stepped(line, delta));
  }

  setUnitCost(key: string, cost: number | null): string | null {
    if (cost !== null) {
      if (!Number.isFinite(cost) || cost < 0) return 'Cost cannot be negative.';
      if (cost > MAX_MONEY) return 'Cost cannot be more than ₹99,99,999.99.';
    }
    this.patch(key, { unitCost: cost === null ? null : twoDecimals(cost) });
    return null;
  }

  setNote(key: string, note: string): void {
    this.patch(key, { note: note.slice(0, 200) });
  }

  remove(key: string): void {
    this.rawLines.update((lines) => lines.filter((line) => line.key !== key));
  }

  clearLines(): void {
    this.rawLines.set([]);
  }

  /**
   * Shows the stock as it is now (after the server refused a count because it had moved).
   * Lines whose stock changed remember what was shown before. Returns how many changed.
   */
  updateStock(levels: readonly StockLevel[]): number {
    const byKey = new Map(levels.map((level) => [lineKey(level), level.stock]));
    let changed = 0;
    this.rawLines.update((lines) =>
      lines.map((line) => {
        const stock = byKey.get(line.key);
        if (stock === undefined || stock === line.stock) return line;
        changed += 1;
        return { ...line, stock, previousStock: line.previousStock ?? line.stock };
      }),
    );
    return changed;
  }

  // ---- Start / save ----------------------------------------------------------------------------

  /** Starts a new adjustment dated `today`. */
  reset(today: string, reason: AdjustmentReason = 'stock_count'): void {
    this.date.set(today);
    this.reason.set(reason);
    this.mode.set(ADJUSTMENT_REASON_MODES[reason]);
    this.notes.set('');
    this.rawLines.set([]);
    this.markSaved();
  }

  markSaved(): void {
    this.savedSnapshot.set(this.snapshot());
  }

  /** Request body (call only when problem() is null). */
  toInput(): AdjustmentInput {
    const count = this.mode() === 'count';
    return {
      adjustmentDate: this.date(),
      mode: this.mode(),
      reason: this.reason(),
      notes: this.notes().trim(),
      items: this.rawLines().map((line) => ({
        productId: line.item.productId,
        variantId: line.item.variantId,
        countedQuantity: count ? line.counted : null,
        quantity: count ? null : line.change,
        systemQuantity: count ? line.stock : null,
        unitCost: line.unitCost,
        note: line.note.trim(),
      })),
    };
  }

  private scanStepFor(): 1 | -1 {
    return this.mode() === 'count' ? 1 : this.scanStep();
  }

  /** The line's quantity one step on: counts never go below 0, changes skip 0. */
  private stepped(line: AdjLine, delta: 1 | -1): Partial<AdjLine> {
    if (this.mode() === 'count') {
      const next = threeDecimals((line.counted ?? 0) + delta);
      return { counted: Math.min(MAX_QUANTITY, Math.max(0, next)) };
    }
    let next = threeDecimals((line.change ?? 0) + delta);
    if (next === 0) next = delta;
    return { change: Math.min(MAX_QUANTITY, Math.max(-MAX_QUANTITY, next)) };
  }

  private snapshot(): string {
    return JSON.stringify(this.toInput());
  }

  private find(key: string): AdjLine | undefined {
    return this.rawLines().find((line) => line.key === key);
  }

  private patch(key: string, changes: Partial<AdjLine>): void {
    this.rawLines.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }
}

/** A new line without a quantity, costed at the item's purchase price. */
function newLine(item: PurchasableItem): AdjLine {
  return {
    key: lineKey(item),
    item,
    stock: item.stock ?? 0,
    previousStock: null,
    counted: null,
    change: null,
    unitCost: item.purchasePrice ?? null,
    note: '',
    bump: 0,
  };
}

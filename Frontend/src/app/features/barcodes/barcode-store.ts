import { Injectable, computed, signal } from '@angular/core';

import { BarcodeAssignment, BarcodeAssignmentInput, itemKey } from '../../core/models/item.model';
import { SellableItem, itemDetails } from '../../core/models/sale.model';
import { isValidEan13 } from '../../shared/barcode/ean13';
import { LabelData } from './label-layouts';

/** Same rule as the backend's barcode field. */
export const BARCODE_PATTERN = /^[A-Za-z0-9-]{4,48}$/;
export const MAX_COPIES = 999;
/** The server saves at most this many rows at once. */
export const MAX_ROWS = 500;

export interface BarcodeRow {
  /** productId|variantId — adding the same item again adds a label instead of a row. */
  readonly key: string;
  readonly item: SellableItem;
  /** The barcode the item has now ('' = none). */
  readonly current: string;
  /** Typed / scanned barcode to give the item ('' = generate the shop's next number). */
  readonly entered: string;
  /** The item has a barcode and the user chose to change it. */
  readonly replacing: boolean;
  /** Labels to print. */
  readonly copies: number;
  /** Problem reported by the server for this row. */
  readonly serverError: string | null;
  /** Counts re-adds of the same item (drives the row highlight). */
  readonly bump: number;
}

export interface BarcodeRowView extends BarcodeRow {
  readonly index: number;
  readonly details: string;
  /** Will get a barcode when saved (no barcode yet, or being changed). */
  readonly toSave: boolean;
  /** What saving will do: the typed barcode, or the next shop number. */
  readonly willGenerate: boolean;
  readonly error: string | null;
  /** Not an error: e.g. a typed 13-digit number whose check digit looks wrong. */
  readonly warning: string | null;
  /** Labels can be printed (the item has a saved barcode). */
  readonly printable: boolean;
}

const normalize = (code: string) => code.trim().toLowerCase();

/** Validates a row against the format rule and against the other rows. */
function rowError(
  row: BarcodeRow,
  index: number,
  enteredAt: ReadonlyMap<string, number>,
  currentAt: ReadonlyMap<string, number>,
): string | null {
  const toSave = !row.current || row.replacing;
  const code = row.entered.trim();
  if (!toSave || !code) {
    return row.serverError;
  }
  if (!BARCODE_PATTERN.test(code)) {
    return 'Use 4–48 letters, numbers or hyphens (no spaces).';
  }
  const first = enteredAt.get(normalize(code));
  if (first !== undefined && first !== index) {
    return `Same barcode as row ${first + 1}.`;
  }
  const owner = currentAt.get(normalize(code));
  if (owner !== undefined && owner !== index) {
    return `Row ${owner + 1} already has this barcode.`;
  }
  return row.serverError;
}

/**
 * The Barcode Assign worklist: items to give a barcode and / or print labels for. Saving sends
 * every row that has no barcode yet (or is being changed); rows with a barcode can print labels.
 */
@Injectable()
export class BarcodeStore {
  private readonly rawRows = signal<readonly BarcodeRow[]>([]);
  /** Row keys in the order of the last save request (to place server errors). */
  private requestKeys: readonly string[] = [];

  readonly rows = computed<readonly BarcodeRowView[]>(() => {
    const rows = this.rawRows();
    const enteredAt = new Map<string, number>();
    const currentAt = new Map<string, number>();
    rows.forEach((row, index) => {
      const toSave = !row.current || row.replacing;
      const code = normalize(row.entered);
      if (toSave && code && !enteredAt.has(code)) enteredAt.set(code, index);
      // A barcode being replaced is given up, so another row may take it.
      if (row.current && !row.replacing) currentAt.set(normalize(row.current), index);
    });
    return rows.map((row, index) => {
      const toSave = !row.current || row.replacing;
      const code = row.entered.trim();
      return {
        ...row,
        index,
        details: itemDetails(row.item),
        toSave,
        willGenerate: toSave && !code,
        error: rowError(row, index, enteredAt, currentAt),
        warning:
          toSave && /^[0-9]{13}$/.test(code) && !isValidEan13(code)
            ? 'The last digit does not match an EAN-13 number — check it if it was typed.'
            : null,
        printable: !!row.current && !row.replacing,
      };
    });
  });

  readonly count = computed(() => this.rawRows().length);
  readonly toSaveCount = computed(() => this.rows().filter((row) => row.toSave).length);
  readonly toGenerateCount = computed(() => this.rows().filter((row) => row.willGenerate).length);
  readonly errorCount = computed(() => this.rows().filter((row) => row.error).length);
  readonly labelCount = computed(() =>
    this.rows()
      .filter((row) => row.printable)
      .reduce((sum, row) => sum + row.copies, 0),
  );
  /** Rows waiting for a barcode keep the page from being left silently. */
  readonly hasUnsaved = computed(() => this.toSaveCount() > 0);

  /** Adds an item, or one more label when it is already on the list. Returns its row key. */
  add(item: SellableItem, copies = 1): string {
    const key = itemKey(item);
    const existing = this.rawRows().find((row) => row.key === key);
    if (existing) {
      this.patch(key, {
        copies: Math.min(existing.copies + copies, MAX_COPIES),
        bump: existing.bump + 1,
      });
      return key;
    }
    this.rawRows.update((rows) => [
      ...rows,
      {
        key,
        item,
        current: item.barcode,
        entered: '',
        replacing: false,
        copies: Math.min(Math.max(copies, 1), MAX_COPIES),
        serverError: null,
        bump: 0,
      },
    ]);
    return key;
  }

  /**
   * Adds items not on the list yet (existing rows are left as they are), `copies[i]` labels
   * for `items[i]` (default 1). Returns how many were added.
   */
  addMissing(items: readonly SellableItem[], copies: readonly number[] = []): number {
    const known = new Set(this.rawRows().map((row) => row.key));
    let added = 0;
    for (const [index, item] of items.entries()) {
      if (!known.has(itemKey(item)) && this.rawRows().length < MAX_ROWS) {
        this.add(item, copies[index] ?? 1);
        known.add(itemKey(item));
        added++;
      }
    }
    return added;
  }

  remove(key: string): void {
    this.rawRows.update((rows) => rows.filter((row) => row.key !== key));
  }

  clear(): void {
    this.rawRows.set([]);
  }

  setEntered(key: string, text: string): void {
    this.patch(key, { entered: text, serverError: null });
  }

  setCopies(key: string, copies: number): void {
    const value = Number.isFinite(copies) ? Math.trunc(copies) : 1;
    this.patch(key, { copies: Math.min(Math.max(value, 0), MAX_COPIES) });
  }

  setAllCopies(copies: number): void {
    for (const row of this.rawRows()) this.setCopies(row.key, copies);
  }

  /** Starts / cancels changing the barcode of an item that already has one. */
  setReplacing(key: string, replacing: boolean): void {
    this.patch(key, { replacing, entered: '', serverError: null });
  }

  /** The save request: every row without a barcode or being changed. */
  assignmentInput(): BarcodeAssignmentInput[] {
    const rows = this.rows().filter((row) => row.toSave);
    this.requestKeys = rows.map((row) => row.key);
    return rows.map((row) => ({
      productId: row.item.productId,
      variantId: row.item.variantId,
      barcode: row.entered.trim(),
      replace: !!row.current,
    }));
  }

  /** Applies the saved barcodes: rows now have them and can print labels. */
  applySaved(results: readonly BarcodeAssignment[]): void {
    const byKey = new Map(results.map((result) => [itemKey(result), result]));
    this.rawRows.update((rows) =>
      rows.map((row) => {
        const saved = byKey.get(row.key);
        return saved
          ? {
              ...row,
              current: saved.barcode,
              item: { ...row.item, barcode: saved.barcode },
              entered: '',
              replacing: false,
              serverError: null,
            }
          : row;
      }),
    );
  }

  /**
   * Shows a server error on its row when the field names one (`items.<n>.…`, n = position in the
   * last save request). Returns the row key, or null when the error is not about a row.
   */
  applyError(field: string | undefined, message: string): string | null {
    const match = /^items\.(\d+)\./.exec(field ?? '');
    const key = match ? this.requestKeys[Number(match[1])] : undefined;
    if (!key) {
      return null;
    }
    this.patch(key, { serverError: message });
    return key;
  }

  /** Shows a problem found on the server for a row (e.g. a barcode already in use). */
  setRowError(key: string, message: string | null): void {
    this.patch(key, { serverError: message });
  }

  /** One label per copy, for every row with a saved barcode. */
  labels(): LabelData[] {
    const labels: LabelData[] = [];
    for (const row of this.rows()) {
      if (!row.printable) continue;
      const label: LabelData = {
        barcode: row.current,
        productName: row.item.productName,
        details: row.details,
        mrp: row.item.mrp,
        price: row.item.unitPrice,
      };
      for (let copy = 0; copy < row.copies; copy++) labels.push(label);
    }
    return labels;
  }

  private patch(key: string, changes: Partial<BarcodeRow>): void {
    this.rawRows.update((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );
  }
}

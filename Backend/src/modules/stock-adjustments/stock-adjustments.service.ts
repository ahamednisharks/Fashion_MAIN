import { type TransactionClient, withTransaction } from '../../config/database.js';
import { AppError, type ErrorDetail } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import { financialYearStart } from '../purchase-orders/po-number.js';
import type { PurchasableItem } from '../purchase-orders/purchase-orders.schema.js';
import { itemLabel } from '../sales/sales.service.js';
import type { SellableItem } from '../sales/sales.schema.js';
import { StockService } from '../stock/stock.service.js';
import { ADJ_SERIES, formatAdjNo } from './adj-number.js';
import {
  type AdjustmentLineRecord,
  type AdjustmentRecord,
  type AdjustmentTotals,
  StockAdjustmentsRepository,
} from './stock-adjustments.repository.js';
import {
  ADJUSTMENT_DIRECTION,
  ADJUSTMENT_REASON_LABELS,
  type Adjustment,
  type AdjustmentInput,
  type AdjustmentItemInput,
  type AdjustmentItemsQuery,
  type AdjustmentListQuery,
  type AdjustmentNextNumberQuery,
  type AdjustmentSummary,
} from './stock-adjustments.schema.js';

/** The signed-in user saving the adjustment. */
export interface AdjustmentAuthor {
  readonly id: string;
  readonly fullName: string;
}

const round2 = (value: number) => Math.round(Number((value * 100).toFixed(6))) / 100;
const round3 = (value: number) => Math.round(Number((value * 1000).toFixed(6))) / 1000;
/** "7", "2.5", "-3" */
const qty = (value: number) => String(round3(value));
const sameQuantity = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/**
 * Stock adjustments: opening stock, stock counts, damaged / lost / found goods. Saving one
 * records its changes in the stock ledger; cancelling it reverses them. They are not edited.
 */
export class StockAdjustmentsService {
  constructor(
    private readonly adjustments = new StockAdjustmentsRepository(),
    private readonly stock = new StockService(),
  ) {}

  list(query: AdjustmentListQuery): Promise<Paged<AdjustmentSummary>> {
    return this.adjustments.list(query);
  }

  async get(id: string): Promise<Adjustment> {
    return (await this.adjustments.findById(id)) ?? notFound();
  }

  /** Items to load onto an adjustment (a category or brand to count, below-zero items…). */
  items(query: AdjustmentItemsQuery): Promise<PurchasableItem[]> {
    return this.adjustments.items(query);
  }

  /** Preview of the number the next adjustment dated `date` (default today) would get. */
  async nextNumber(query: AdjustmentNextNumberQuery): Promise<{ adjNo: string }> {
    const date = query.date ?? (await this.adjustments.catalogue.today());
    const financialYear = financialYearStart(date);
    return {
      adjNo: formatAdjNo(
        financialYear,
        await this.adjustments.catalogue.peekSequence(ADJ_SERIES, financialYear),
      ),
    };
  }

  create(input: AdjustmentInput, author: AdjustmentAuthor): Promise<Adjustment> {
    return withTransaction(async (tx) => {
      const today = await this.adjustments.catalogue.today(tx);
      if (input.adjustmentDate > today) {
        throw AppError.validation('The date cannot be in the future.', 'adjustmentDate');
      }
      if (input.reason === 'other' && !input.notes) {
        throw AppError.validation(
          'Write in the notes what this adjustment is for (the reason is Other).',
          'notes',
        );
      }
      const checked = await this.checkLines(tx, input);
      // From here until the transaction ends no bill or entry can move these items' stock.
      const levels = await this.stock.lockedLevels(
        tx,
        checked.map(({ item }) => item),
      );
      if (input.mode === 'count') {
        checkStockUnchanged(checked, levels);
      }
      const lines = checked.map(({ input: line, item }, index): AdjustmentLineRecord => {
        const systemQuantity = levels[index] ?? 0;
        const quantity =
          input.mode === 'count'
            ? round3((line.countedQuantity ?? 0) - systemQuantity)
            : round3(line.quantity ?? 0);
        return {
          item,
          systemQuantity,
          countedQuantity: input.mode === 'count' ? line.countedQuantity : null,
          quantity,
          unitCost: line.unitCost,
          value: line.unitCost === null ? 0 : round2(quantity * line.unitCost),
          note: line.note,
        };
      });
      checkDirections(input, lines);

      const record: AdjustmentRecord = {
        adjustmentDate: input.adjustmentDate,
        mode: input.mode,
        reason: input.reason,
        notes: input.notes,
        lines,
        totals: totalsOf(lines),
        userName: author.fullName,
      };
      const financialYear = financialYearStart(input.adjustmentDate);
      const sequenceNo = await this.adjustments.catalogue.nextSequence(
        tx,
        ADJ_SERIES,
        financialYear,
      );
      const adjNo = formatAdjNo(financialYear, sequenceNo);
      const id = await this.adjustments.insert(
        tx,
        { adjNo, financialYear, sequenceNo },
        record,
        author.id,
      );
      await this.stock.record(
        tx,
        { type: 'stock_adjustment', id, no: adjNo, date: input.adjustmentDate, kind: 'adjustment' },
        lines.map((line, index) => ({
          productId: line.item.productId,
          variantId: line.item.variantId,
          lineNo: index + 1,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
      );
      return (await this.adjustments.findById(id, tx)) ?? notFound();
    });
  }

  /** The adjustment is kept but its stock changes are reversed. */
  cancel(id: string, author: AdjustmentAuthor): Promise<Adjustment> {
    return withTransaction(async (tx) => {
      const current = (await this.adjustments.lock(tx, id)) ?? notFound();
      if (current.status === 'cancelled') {
        throw AppError.validation(`${current.adjNo} is already cancelled.`, 'status');
      }
      await this.adjustments.cancel(tx, id, author.fullName);
      await this.stock.remove(tx, 'stock_adjustment', id);
      return (await this.adjustments.findById(id, tx)) ?? notFound();
    });
  }

  /**
   * Every line must be an existing item (inactive ones too — their stock can still be written
   * off), listed once, with the quantity its mode needs and, except fabric, whole numbers.
   */
  private async checkLines(
    tx: TransactionClient,
    input: AdjustmentInput,
  ): Promise<{ input: AdjustmentItemInput; item: SellableItem }[]> {
    const catalogue = await this.adjustments.catalogue.findItemsOfProducts(
      tx,
      input.items.map((line) => line.productId),
    );
    const byKey = new Map(catalogue.map((item) => [keyOf(item), item]));
    const withVariants = new Set(
      catalogue.filter((item) => item.variantId).map((item) => item.productId),
    );
    const seen = new Map<string, number>();

    return input.items.map((line, index) => {
      const field = (name: string) => `items.${index}.${name}`;
      const key = keyOf(line);
      const item = byKey.get(key);
      if (!item) {
        if (!line.variantId && withVariants.has(line.productId)) {
          throw AppError.validation(
            `Line ${index + 1}: choose a size / colour of this product.`,
            field('variantId'),
          );
        }
        throw AppError.validation(
          `Line ${index + 1}: this item no longer exists. Remove it from the stock adjustment.`,
          field('productId'),
        );
      }
      const label = itemLabel(item);
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        throw AppError.validation(
          `${label} is on lines ${earlier + 1} and ${index + 1}. Keep one line.`,
          field('productId'),
        );
      }
      seen.set(key, index);

      const quantityField = input.mode === 'count' ? 'countedQuantity' : 'quantity';
      const value = input.mode === 'count' ? line.countedQuantity : line.quantity;
      if (value === null) {
        throw AppError.validation(
          input.mode === 'count'
            ? `${label}: enter the quantity counted.`
            : `${label}: enter the quantity to add (+) or take out (−).`,
          field(quantityField),
        );
      }
      if (input.mode === 'change' && value === 0) {
        throw AppError.validation(
          `${label}: the change cannot be 0 — enter + to add or − to take out.`,
          field(quantityField),
        );
      }
      if (item.productType !== 'fabric' && !Number.isInteger(value)) {
        throw AppError.validation(
          `${label}: quantity must be a whole number (decimals are only for fabric).`,
          field(quantityField),
        );
      }
      return { input: line, item };
    });
  }
}

/**
 * Count mode works out the change from the stock at save time. When a bill or purchase entry
 * moved an item's stock after the screen showed it, the count may already include (or miss)
 * that movement — so the save is refused and the screen refreshes the stock for a check.
 */
function checkStockUnchanged(
  lines: readonly { input: AdjustmentItemInput; item: SellableItem }[],
  levels: readonly number[],
): void {
  const details: ErrorDetail[] = [];
  for (const [index, { input, item }] of lines.entries()) {
    const now = levels[index] ?? 0;
    if (input.systemQuantity !== null && !sameQuantity(input.systemQuantity, now)) {
      details.push({
        field: `items.${index}.systemQuantity`,
        message: `${itemLabel(item)}: in stock is now ${qty(now)} (the screen showed ${qty(input.systemQuantity)}).`,
      });
    }
  }
  if (!details.length) return;
  const message =
    details.length === 1
      ? `${details[0].message} A bill or purchase entry was saved meanwhile — check the count ` +
        'and save again.'
      : `The stock of ${details.length} items has changed since they were added (bills or ` +
        'purchase entries saved meanwhile). Check their counts and save again.';
  throw AppError.validation(message, details[0].field, details);
}

/** Damaged / lost goods only leave stock; found goods only come in. */
function checkDirections(input: AdjustmentInput, lines: readonly AdjustmentLineRecord[]): void {
  const direction = ADJUSTMENT_DIRECTION[input.reason];
  if (!direction) return;
  const reason = ADJUSTMENT_REASON_LABELS[input.reason].toLowerCase();
  const field = input.mode === 'count' ? 'countedQuantity' : 'quantity';
  for (const [index, line] of lines.entries()) {
    const label = itemLabel(line.item);
    if (direction === 'out' && line.quantity > 0) {
      throw AppError.validation(
        `${label}: the stock would go up by ${qty(line.quantity)}, but ${reason} goods can only ` +
          'be taken out of stock. Choose another reason (e.g. Stock count).',
        `items.${index}.${field}`,
      );
    }
    if (direction === 'in' && line.quantity < 0) {
      throw AppError.validation(
        `${label}: the stock would go down by ${qty(-line.quantity)}, but ${reason} goods can ` +
          'only be added to stock. Choose another reason (e.g. Stock count).',
        `items.${index}.${field}`,
      );
    }
  }
}

function totalsOf(lines: readonly AdjustmentLineRecord[]): AdjustmentTotals {
  const sum = (pick: (line: AdjustmentLineRecord) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);
  return {
    itemCount: lines.length,
    quantityIn: round3(sum((line) => Math.max(line.quantity, 0))),
    quantityOut: round3(sum((line) => Math.max(-line.quantity, 0))),
    valueIn: round2(sum((line) => Math.max(line.value, 0))),
    valueOut: round2(sum((line) => Math.max(-line.value, 0))),
  };
}

const keyOf = (item: { productId: string; variantId: string | null }) =>
  `${item.productId}|${item.variantId ?? ''}`;

function notFound(): never {
  throw AppError.notFound('Stock adjustment not found.');
}

export const stockAdjustmentsService = new StockAdjustmentsService();

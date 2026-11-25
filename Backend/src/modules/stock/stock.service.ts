import { type TransactionClient, pool } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  type StockDocument,
  type StockItem,
  type StockLine,
  StockRepository,
  stockItemKey,
} from './stock.repository.js';
import type {
  StockHistory,
  StockHistoryQuery,
  StockLevel,
  StockLevelsInput,
  StockSourceType,
} from './stock.schema.js';

/**
 * The stock ledger. Documents that move stock (purchase entries, bills, stock adjustments) call
 * record() inside their own transaction whenever they are saved, edited or cancelled: the
 * document's movements become exactly the lines given, and the quantity in hand of every item
 * involved (before or after) is recomputed from its movements.
 */
export class StockService {
  constructor(private readonly stock = new StockRepository()) {}

  async record(
    tx: TransactionClient,
    document: StockDocument,
    lines: readonly StockLine[],
  ): Promise<void> {
    const moving = lines.filter((line) => line.quantity !== 0);
    const before = await this.stock.itemsOf(tx, document.type, document.id);
    const items = uniqueItems([...before, ...moving]);
    await this.stock.lockItems(tx, items);
    await this.stock.deleteMovements(tx, document.type, document.id);
    await this.stock.insertMovements(tx, document, moving);
    await this.stock.refreshLevels(tx, items);
  }

  /** The document no longer moves stock (e.g. cancelled). */
  async remove(tx: TransactionClient, type: StockSourceType, id: string): Promise<void> {
    const items = await this.stock.itemsOf(tx, type, id);
    if (!items.length) return;
    await this.stock.lockItems(tx, items);
    await this.stock.deleteMovements(tx, type, id);
    await this.stock.refreshLevels(tx, items);
  }

  /**
   * Locks the items for the rest of the transaction (as record() does — taking the locks again
   * there is fine) and returns their quantity in hand, in the order given. Nothing else can
   * change their stock until the transaction ends.
   */
  async lockedLevels(tx: TransactionClient, items: readonly StockItem[]): Promise<number[]> {
    await this.stock.lockItems(tx, items);
    return this.stock.levels(tx, items);
  }

  /** Quantity in hand of each item now (screens refreshing what they show). */
  async levels(query: StockLevelsInput): Promise<StockLevel[]> {
    const items = query.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
    }));
    const levels = await this.stock.levels(pool, items);
    return items.map((item, index) => ({ ...item, stock: levels[index] ?? 0 }));
  }

  async history(query: StockHistoryQuery): Promise<StockHistory> {
    const item: StockItem = { productId: query.productId, variantId: query.variantId ?? null };
    const [stock, totalMovements, movements] = await Promise.all([
      this.stock.level(item),
      this.stock.countMovements(item),
      this.stock.history(item, query.limit),
    ]);
    if (!totalMovements && !(await this.itemExists(item))) {
      throw AppError.notFound('Item not found.');
    }
    return { ...item, stock, totalMovements, movements };
  }

  private async itemExists(item: StockItem): Promise<boolean> {
    return this.stock.itemExists(item);
  }
}

function uniqueItems(items: readonly StockItem[]): StockItem[] {
  const byKey = new Map(
    items.map((item) => [
      stockItemKey(item),
      { productId: item.productId, variantId: item.variantId },
    ]),
  );
  return [...byKey.values()];
}

export const stockService = new StockService();

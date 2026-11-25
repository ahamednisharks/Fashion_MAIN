import { type TransactionClient, withTransaction } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import { ProductsRepository } from '../products/products.repository.js';
import { SalesRepository } from '../sales/sales.repository.js';
import { itemLabel } from '../sales/sales.service.js';
import type { SellableItem } from '../sales/sales.schema.js';
import { type BarcodeSettingsRow, type BarcodeWrite, ItemsRepository } from './items.repository.js';
import type {
  BarcodeAssignment,
  BarcodeAssignmentsInput,
  BarcodeSettings,
  BarcodeSettingsInput,
  CatalogItem,
  ItemCounts,
  ItemListQuery,
} from './items.schema.js';
import { MAX_RUNNING_NUMBER, shopBarcode } from './shop-barcode.js';

const itemKey = (productId: string, variantId: string | null) => `${productId}|${variantId ?? ''}`;
const sameCode = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A request row after its item has been found. */
interface PlannedRow {
  index: number;
  item: SellableItem;
  /** Barcode asked for ('' = generate the next shop barcode). */
  requested: string;
  /** Nothing to do: the item already has the requested barcode. */
  unchanged: boolean;
}

function toSettings(row: BarcodeSettingsRow): BarcodeSettings {
  const next = row.lastNumber + 1;
  return {
    ...row,
    nextBarcode: next <= MAX_RUNNING_NUMBER ? shopBarcode(row.prefix, next) : '',
  };
}

export class ItemsService {
  constructor(
    private readonly items = new ItemsRepository(),
    private readonly catalogue = new SalesRepository(),
    private readonly products = new ProductsRepository(),
  ) {}

  list(query: ItemListQuery): Promise<Paged<CatalogItem>> {
    return this.items.list(query);
  }

  counts(): Promise<ItemCounts> {
    return this.items.counts();
  }

  async settings(): Promise<BarcodeSettings> {
    return toSettings(await this.items.getSettings());
  }

  async saveSettings(input: BarcodeSettingsInput): Promise<BarcodeSettings> {
    return toSettings(await this.items.saveSettings(input));
  }

  /**
   * Gives items a barcode — the one sent (e.g. a maker's barcode, scanned) or the shop's next
   * generated number. All or nothing: any problem refuses the whole save, naming the row
   * (`items.<n>.barcode`). Runs under the catalogue-codes lock, like product saves, so a barcode
   * can never end up on two items.
   */
  assign(input: BarcodeAssignmentsInput): Promise<BarcodeAssignment[]> {
    return withTransaction(async (tx) => {
      await this.products.lockCatalogCodes(tx);
      const rows = await this.planRows(tx, input);
      await this.checkRequestedCodes(tx, rows);

      const toGenerate = rows.filter((row) => !row.unchanged && !row.requested);
      const generated = toGenerate.length
        ? await this.generateCodes(
            tx,
            toGenerate.length,
            rows.map((row) => row.requested).filter(Boolean),
          )
        : [];

      const writes: BarcodeWrite[] = [];
      const result: BarcodeAssignment[] = [];
      let next = 0;
      for (const row of rows) {
        const previousBarcode = row.item.barcode;
        const isGenerated = !row.unchanged && !row.requested;
        const barcode = row.unchanged
          ? previousBarcode
          : isGenerated
            ? (generated[next++] ?? '')
            : row.requested;
        if (!row.unchanged) {
          writes.push({ productId: row.item.productId, variantId: row.item.variantId, barcode });
        }
        result.push({
          productId: row.item.productId,
          variantId: row.item.variantId,
          barcode,
          previousBarcode,
          generated: isGenerated,
        });
      }
      await this.items.writeBarcodes(tx, writes);
      return result;
    });
  }

  /** Finds every row's item and decides what happens to it. */
  private async planRows(
    tx: TransactionClient,
    input: BarcodeAssignmentsInput,
  ): Promise<PlannedRow[]> {
    const found = await this.catalogue.findItemsOfProducts(
      tx,
      input.items.map((row) => row.productId),
    );
    const byKey = new Map(found.map((item) => [itemKey(item.productId, item.variantId), item]));
    const seen = new Map<string, number>();

    return input.items.map((row, index): PlannedRow => {
      const key = itemKey(row.productId, row.variantId);
      const item = byKey.get(key);
      if (!item) {
        const product = found.find((candidate) => candidate.productId === row.productId);
        throw AppError.validation(
          product && row.variantId === null
            ? `${product.productName} has sizes / colours — choose the variant to give a barcode.`
            : 'This item no longer exists. Remove it from the list and add it again.',
          `items.${index}.variantId`,
        );
      }
      const first = seen.get(key);
      if (first !== undefined) {
        throw AppError.validation(
          `${itemLabel(item)} is listed twice (rows ${first + 1} and ${index + 1}).`,
          `items.${index}.productId`,
        );
      }
      seen.set(key, index);

      const current = item.barcode;
      const requested = row.barcode;
      const unchanged = !!current && !!requested && sameCode(current, requested);
      if (current && !unchanged && !row.replace) {
        throw AppError.validation(
          `${itemLabel(item)} already has barcode ${current}. Choose “Change” to replace it.`,
          `items.${index}.barcode`,
        );
      }
      return { index, item, requested, unchanged };
    });
  }

  /** Barcodes typed / scanned in must be unique in the request and in the catalogue. */
  private async checkRequestedCodes(tx: TransactionClient, rows: readonly PlannedRow[]) {
    const requested = rows.filter((row) => !row.unchanged && row.requested);
    const firstRow = new Map<string, PlannedRow>();
    for (const row of requested) {
      const code = row.requested.toLowerCase();
      const first = firstRow.get(code);
      if (first) {
        throw AppError.duplicate(
          `Barcode ${row.requested} is entered for two items (rows ${first.index + 1} and ` +
            `${row.index + 1}).`,
          `items.${row.index}.barcode`,
        );
      }
      firstRow.set(code, row);
    }

    const owners = await this.products.findBarcodeOwners(
      tx,
      requested.map((row) => row.requested),
      {},
    );
    for (const owner of owners) {
      const row = firstRow.get(owner.code);
      if (row) {
        throw AppError.duplicate(
          `Barcode ${row.requested} is already used by “${owner.productName}”.`,
          `items.${row.index}.barcode`,
        );
      }
    }
  }

  /**
   * The next `count` shop barcodes, skipping numbers that are already on an item or were typed
   * into this request. Advances the counter in the same transaction (rolled back on failure).
   */
  private async generateCodes(
    tx: TransactionClient,
    count: number,
    reserved: readonly string[],
  ): Promise<string[]> {
    const settings = await this.items.lockSettings(tx);
    const taken = new Set(reserved.map((code) => code.toLowerCase()));
    const codes: string[] = [];
    let last = settings.lastNumber;

    while (codes.length < count) {
      const batch: string[] = [];
      while (batch.length < count - codes.length) {
        if (last >= MAX_RUNNING_NUMBER) {
          throw AppError.validation(
            `All barcode numbers starting ${settings.prefix} are used. Choose another prefix in ` +
              'the label settings.',
            'items',
          );
        }
        last += 1;
        const code = shopBarcode(settings.prefix, last);
        if (!taken.has(code)) batch.push(code);
      }
      const owned = new Set(
        (await this.products.findBarcodeOwners(tx, batch, {})).map((owner) => owner.code),
      );
      for (const code of batch) {
        if (!owned.has(code)) codes.push(code);
      }
    }

    await this.items.setLastNumber(tx, last);
    return codes;
  }
}

export const itemsService = new ItemsService();

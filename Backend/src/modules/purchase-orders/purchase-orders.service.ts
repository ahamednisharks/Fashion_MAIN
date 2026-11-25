import { type TransactionClient, withTransaction } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import { stateFromGstin } from '../../common/validators/gstin.js';
import { ShopSettingsRepository } from '../settings/shop-settings.repository.js';
import { type SupplyType, calculatePo } from './po-calculator.js';
import { PO_SERIES, financialYearStart, formatPoNo } from './po-number.js';
import { checkPurchaseLines, checkPurchaseSupplier } from './purchase-lines.js';
import {
  type PoRecord,
  type PoSupplier,
  PurchaseOrdersRepository,
} from './purchase-orders.repository.js';
import type {
  NextNumberQuery,
  Po,
  PoInput,
  PoListQuery,
  PoSummary,
  PurchasableItem,
} from './purchase-orders.schema.js';

/** The signed-in user saving the PO. */
export interface PoAuthor {
  readonly id: string;
  readonly fullName: string;
}

const PO_WORDS = { name: 'purchase order', verb: 'ordered' };

/**
 * CGST + SGST when the supplier is in the shop's state (or either state is unknown);
 * IGST when the supplier is in another state (taken from the GSTIN when there is one).
 */
export function poSupplyTypeFor(
  shopState: string,
  supplier: Pick<PoSupplier, 'gstNumber' | 'state'>,
): SupplyType {
  const supplierState =
    (supplier.gstNumber && stateFromGstin(supplier.gstNumber)?.name) || supplier.state;
  return shopState && supplierState && supplierState !== shopState ? 'inter' : 'intra';
}

export class PurchaseOrdersService {
  constructor(
    private readonly orders = new PurchaseOrdersRepository(),
    private readonly settings = new ShopSettingsRepository(),
  ) {}

  lookupItems(code: string): Promise<PurchasableItem[]> {
    return this.orders.lookupItems(code);
  }

  searchItems(search: string, limit: number): Promise<PurchasableItem[]> {
    return this.orders.searchItems(search, limit);
  }

  list(query: PoListQuery): Promise<Paged<PoSummary>> {
    return this.orders.list(query);
  }

  async get(id: string): Promise<Po> {
    return (await this.orders.findById(id)) ?? notFound();
  }

  /** Preview of the number the next PO dated `date` (default today) would get. */
  async nextNumber(query: NextNumberQuery): Promise<{ poNo: string }> {
    const date = query.date ?? (await this.orders.today());
    const financialYear = financialYearStart(date);
    return {
      poNo: formatPoNo(financialYear, await this.orders.peekSequence(PO_SERIES, financialYear)),
    };
  }

  create(input: PoInput, author: PoAuthor): Promise<Po> {
    return withTransaction(async (tx) => {
      const record = await this.prepare(tx, input, author, null);
      const financialYear = financialYearStart(input.poDate);
      const sequenceNo = await this.orders.nextSequence(tx, PO_SERIES, financialYear);
      const id = await this.orders.insert(
        tx,
        { poNo: formatPoNo(financialYear, sequenceNo), financialYear, sequenceNo },
        record,
        author.id,
      );
      return (await this.orders.findById(id, tx)) ?? notFound();
    });
  }

  /** Open POs with nothing received yet can be changed; the PO number stays the same. */
  update(id: string, input: PoInput, author: PoAuthor): Promise<Po> {
    return withTransaction(async (tx) => {
      const current = (await this.orders.lock(tx, id)) ?? notFound();
      if (current.status !== 'open' || current.received) {
        throw AppError.validation(
          current.status === 'cancelled'
            ? `${current.poNo} is cancelled and cannot be changed.`
            : `Goods have been received against ${current.poNo}, so it cannot be changed.`,
          'status',
        );
      }
      if (financialYearStart(input.poDate) !== current.financialYear) {
        const fy = current.financialYear;
        throw AppError.validation(
          `The PO date must stay in the financial year of ${current.poNo} ` +
            `(1 Apr ${fy} – 31 Mar ${fy + 1}).`,
          'poDate',
        );
      }
      const record = await this.prepare(tx, input, author, current.supplierId);
      await this.orders.update(tx, id, record);
      return (await this.orders.findById(id, tx)) ?? notFound();
    });
  }

  /** Only open POs with nothing received can be cancelled. */
  cancel(id: string, author: PoAuthor): Promise<Po> {
    return withTransaction(async (tx) => {
      const current = (await this.orders.lock(tx, id)) ?? notFound();
      if (current.status === 'cancelled') {
        throw AppError.validation(`${current.poNo} is already cancelled.`, 'status');
      }
      if (current.status !== 'open' || current.received) {
        throw AppError.validation(
          `Goods have been received against ${current.poNo}, so it cannot be cancelled.`,
          'status',
        );
      }
      await this.orders.cancel(tx, id, author.fullName);
      return (await this.orders.findById(id, tx)) ?? notFound();
    });
  }

  /**
   * Checks the supplier, dates and lines and computes the amounts. `keepSupplierId` is the
   * supplier the PO already has — it may stay even if it was deactivated meanwhile.
   */
  private async prepare(
    tx: TransactionClient,
    input: PoInput,
    author: PoAuthor,
    keepSupplierId: string | null,
  ): Promise<PoRecord> {
    const today = await this.orders.today(tx);
    if (input.poDate > today) {
      throw AppError.validation('PO date cannot be in the future.', 'poDate');
    }
    const supplier = await checkPurchaseSupplier(this.orders, tx, input.supplierId, keepSupplierId);
    const lines = await checkPurchaseLines(this.orders, tx, input.items, PO_WORDS);
    const shop = await this.settings.get(tx);
    const supplyType = poSupplyTypeFor(shop.state, supplier);
    const calculation = calculatePo(
      lines.map(({ input: line, item }) => ({
        rate: line.rate,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        gstRate: item.gstRate,
      })),
      supplyType,
    );
    return {
      poDate: input.poDate,
      expectedDate: input.expectedDate,
      supplier,
      supplyType,
      notes: input.notes,
      calculation,
      lines: lines.map(({ input: line, item }) => ({
        item,
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: line.discountPercent,
      })),
      userName: author.fullName,
    };
  }
}

function notFound(): never {
  throw AppError.notFound('Purchase order not found.');
}

export const purchaseOrdersService = new PurchaseOrdersService();

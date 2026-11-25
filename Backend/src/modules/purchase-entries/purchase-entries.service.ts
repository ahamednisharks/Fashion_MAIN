import { type TransactionClient, withTransaction } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import { calculatePo } from '../purchase-orders/po-calculator.js';
import { financialYearStart } from '../purchase-orders/po-number.js';
import { checkPurchaseLines, checkPurchaseSupplier } from '../purchase-orders/purchase-lines.js';
import type { PoSummary, ReceivableOrder } from '../purchase-orders/purchase-orders.schema.js';
import { poSupplyTypeFor } from '../purchase-orders/purchase-orders.service.js';
import { itemLabel } from '../sales/sales.service.js';
import { ShopSettingsRepository } from '../settings/shop-settings.repository.js';
import { StockService } from '../stock/stock.service.js';
import { PE_SERIES, formatPeNo } from './pe-number.js';
import {
  type PeLock,
  type PeRecord,
  PurchaseEntriesRepository,
} from './purchase-entries.repository.js';
import type {
  Pe,
  PeInput,
  PeLabelItem,
  PeListQuery,
  PeNextNumberQuery,
  PeSummary,
} from './purchase-entries.schema.js';

/** The signed-in user saving the entry. */
export interface PeAuthor {
  readonly id: string;
  readonly fullName: string;
}

const PE_WORDS = { name: 'purchase entry', verb: 'received' };

/**
 * Purchase entries: goods received from a supplier's invoice, optionally against one of the
 * supplier's purchase orders. Saving (or editing / cancelling) an entry recomputes the PO's
 * received quantities and status; saving also gives the items the entry's purchase rate, MRP
 * and selling price.
 */
export class PurchaseEntriesService {
  constructor(
    private readonly entries = new PurchaseEntriesRepository(),
    private readonly settings = new ShopSettingsRepository(),
    private readonly stock = new StockService(),
  ) {}

  list(query: PeListQuery): Promise<Paged<PeSummary>> {
    return this.entries.list(query);
  }

  async get(id: string): Promise<Pe> {
    return (await this.entries.findById(id)) ?? notFound();
  }

  /** The entry's items as they are now, with the received quantity as label copies. */
  async labels(id: string): Promise<PeLabelItem[]> {
    await this.get(id);
    return this.entries.labelItems(id);
  }

  /** Preview of the number the next entry received on `date` (default today) would get. */
  async nextNumber(query: PeNextNumberQuery): Promise<{ peNo: string }> {
    const date = query.date ?? (await this.entries.orders.today());
    const financialYear = financialYearStart(date);
    return {
      peNo: formatPeNo(
        financialYear,
        await this.entries.orders.peekSequence(PE_SERIES, financialYear),
      ),
    };
  }

  /** Open and partly received POs (of one supplier, or all) to receive against. */
  receivableOrders(supplierId?: string): Promise<PoSummary[]> {
    return this.entries.orders.listReceivable(supplierId);
  }

  /** A PO's lines with the items as they are now and what is still to come. */
  async receivableOrder(id: string): Promise<ReceivableOrder> {
    const order = await this.entries.orders.findReceivable(id);
    if (!order) {
      throw AppError.notFound('Purchase order not found.');
    }
    return order;
  }

  create(input: PeInput, author: PeAuthor): Promise<Pe> {
    return withTransaction(async (tx) => {
      const financialYear = financialYearStart(input.entryDate);
      const record = await this.prepare(tx, input, author, null);
      await this.checkInvoice(tx, record, financialYear, null);
      const sequenceNo = await this.entries.orders.nextSequence(tx, PE_SERIES, financialYear);
      const peNo = formatPeNo(financialYear, sequenceNo);
      const id = await this.entries.insert(
        tx,
        { peNo, financialYear, sequenceNo },
        record,
        author.id,
      );
      await this.entries.applyItemPrices(tx, record.lines);
      await this.recordStock(tx, id, peNo, record);
      if (record.purchaseOrderId) {
        await this.entries.refreshOrderReceipts(tx, record.purchaseOrderId);
      }
      return (await this.entries.findById(id, tx)) ?? notFound();
    });
  }

  /** Saved entries can be changed; the number stays and the PO quantities follow. */
  update(id: string, input: PeInput, author: PeAuthor): Promise<Pe> {
    return withTransaction(async (tx) => {
      const current = (await this.entries.lock(tx, id)) ?? notFound();
      if (current.status === 'cancelled') {
        throw AppError.validation(`${current.peNo} is cancelled and cannot be changed.`, 'status');
      }
      if (financialYearStart(input.entryDate) !== current.financialYear) {
        const fy = current.financialYear;
        throw AppError.validation(
          `The received date must stay in the financial year of ${current.peNo} ` +
            `(1 Apr ${fy} – 31 Mar ${fy + 1}).`,
          'entryDate',
        );
      }
      const record = await this.prepare(tx, input, author, current);
      await this.checkInvoice(tx, record, current.financialYear, id);
      await this.entries.update(tx, id, record);
      await this.entries.applyItemPrices(tx, record.lines);
      await this.recordStock(tx, id, current.peNo, record);
      for (const poId of new Set([current.purchaseOrderId, record.purchaseOrderId])) {
        if (poId) await this.entries.refreshOrderReceipts(tx, poId);
      }
      return (await this.entries.findById(id, tx)) ?? notFound();
    });
  }

  /**
   * Cancelled entries are kept but no longer count as received (the PO goes back to open /
   * partial). Item prices set by the entry stay as they are.
   */
  cancel(id: string, author: PeAuthor): Promise<Pe> {
    return withTransaction(async (tx) => {
      const current = (await this.entries.lock(tx, id)) ?? notFound();
      if (current.status === 'cancelled') {
        throw AppError.validation(`${current.peNo} is already cancelled.`, 'status');
      }
      if (current.purchaseOrderId) {
        await this.entries.orders.lockForReceipt(tx, [current.purchaseOrderId]);
      }
      await this.entries.cancel(tx, id, author.fullName);
      // Cancelled goods leave stock again.
      await this.stock.remove(tx, 'purchase_entry', id);
      if (current.purchaseOrderId) {
        await this.entries.refreshOrderReceipts(tx, current.purchaseOrderId);
      }
      return (await this.entries.findById(id, tx)) ?? notFound();
    });
  }

  /** Received goods enter stock at their cost (GST exclusive, after the line discount). */
  private recordStock(
    tx: TransactionClient,
    id: string,
    peNo: string,
    record: PeRecord,
  ): Promise<void> {
    return this.stock.record(
      tx,
      { type: 'purchase_entry', id, no: peNo, date: record.entryDate, kind: 'purchase' },
      record.lines.map((line, index) => ({
        productId: line.item.productId,
        variantId: line.item.variantId,
        lineNo: index + 1,
        quantity: line.quantity,
        unitCost:
          Math.round((record.calculation.lines[index].taxableValue / line.quantity) * 100) / 100,
      })),
    );
  }

  /** Checks the supplier, dates, PO and lines and computes the amounts. */
  private async prepare(
    tx: TransactionClient,
    input: PeInput,
    author: PeAuthor,
    current: PeLock | null,
  ): Promise<PeRecord> {
    const today = await this.entries.orders.today(tx);
    if (input.entryDate > today) {
      throw AppError.validation('Received date cannot be in the future.', 'entryDate');
    }
    const supplier = await checkPurchaseSupplier(
      this.entries.orders,
      tx,
      input.supplierId,
      current?.supplierId ?? null,
    );
    await this.checkOrder(tx, input.purchaseOrderId, supplier, current?.purchaseOrderId ?? null);

    const lines = await checkPurchaseLines(
      this.entries.orders,
      tx,
      input.items,
      PE_WORDS,
      new Set(current?.itemKeys ?? []),
    );
    const priced = lines.map(({ input: line, item }, index) => {
      const mrp = line.mrp ?? item.mrp;
      const sellingPrice = line.sellingPrice ?? item.unitPrice;
      if (sellingPrice > mrp) {
        throw AppError.validation(
          `${itemLabel(item)}: selling price cannot be more than the MRP.`,
          `items.${index}.sellingPrice`,
        );
      }
      return {
        item,
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: line.discountPercent,
        mrp,
        sellingPrice,
      };
    });

    const shop = await this.settings.get(tx);
    const supplyType = poSupplyTypeFor(shop.state, supplier);
    const calculation = calculatePo(
      priced.map((line) => ({
        rate: line.rate,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        gstRate: line.item.gstRate,
      })),
      supplyType,
    );
    return {
      entryDate: input.entryDate,
      supplier,
      supplierInvoiceNo: input.supplierInvoiceNo,
      supplierInvoiceDate: input.supplierInvoiceDate,
      purchaseOrderId: input.purchaseOrderId,
      supplyType,
      notes: input.notes,
      billAmount: input.billAmount,
      calculation,
      lines: priced,
      userName: author.fullName,
    };
  }

  /**
   * Locks the POs involved (the chosen one and the one the entry had) and checks the chosen PO:
   * same supplier, not cancelled, and something still to receive — unless the entry already
   * belongs to it (editing an entry that completed its PO).
   */
  private async checkOrder(
    tx: TransactionClient,
    purchaseOrderId: string | null,
    supplier: { id: string; name: string },
    currentOrderId: string | null,
  ): Promise<void> {
    const ids = [purchaseOrderId, currentOrderId].filter((id): id is string => !!id);
    if (!ids.length) {
      return;
    }
    const locked = await this.entries.orders.lockForReceipt(tx, ids);
    if (!purchaseOrderId) {
      return;
    }
    const order = locked.find((candidate) => candidate.id === purchaseOrderId);
    if (!order) {
      throw AppError.validation('The selected purchase order does not exist.', 'purchaseOrderId');
    }
    if (order.supplierId !== supplier.id) {
      throw AppError.validation(
        `${order.poNo} is not a purchase order of ${supplier.name}.`,
        'purchaseOrderId',
      );
    }
    if (order.status === 'cancelled') {
      throw AppError.validation(
        `${order.poNo} is cancelled, so goods cannot be received against it.`,
        'purchaseOrderId',
      );
    }
    if (order.status === 'received' && order.id !== currentOrderId) {
      throw AppError.validation(
        `Everything on ${order.poNo} has already been received.`,
        'purchaseOrderId',
      );
    }
  }

  /** The same supplier invoice may be entered only once per financial year. */
  private async checkInvoice(
    tx: TransactionClient,
    record: PeRecord,
    financialYear: number,
    excludeId: string | null,
  ): Promise<void> {
    const existing = await this.entries.findInvoice(
      tx,
      record.supplier.id,
      financialYear,
      record.supplierInvoiceNo,
      excludeId,
    );
    if (existing) {
      throw AppError.duplicate(
        `Invoice ${record.supplierInvoiceNo} of ${record.supplier.name} is already entered ` +
          `as ${existing}.`,
        'supplierInvoiceNo',
      );
    }
  }
}

function notFound(): never {
  throw AppError.notFound('Purchase entry not found.');
}

export const purchaseEntriesService = new PurchaseEntriesService();

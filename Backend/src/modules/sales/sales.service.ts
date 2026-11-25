import { type TransactionClient, withTransaction } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import { stateFromGstin } from '../../common/validators/gstin.js';
import { ShopSettingsRepository } from '../settings/shop-settings.repository.js';
import { StockService } from '../stock/stock.service.js';
import type { ShopProfile } from '../settings/shop-settings.schema.js';
import { type SupplyType, calculateBill, formatRupees, settlePayments } from './bill-calculator.js';
import { financialYearOf, formatInvoiceNo } from './invoice-number.js';
import { type BillCustomer, SalesRepository } from './sales.repository.js';
import type {
  Invoice,
  InvoiceInput,
  InvoiceItemInput,
  InvoiceListQuery,
  InvoiceSummary,
  ItemLookupQuery,
  ItemSearchQuery,
  SellableItem,
} from './sales.schema.js';

/** The signed-in user saving the bill. */
export interface BillAuthor {
  readonly id: string;
  readonly fullName: string;
}

interface CheckedLine {
  readonly input: InvoiceItemInput;
  readonly item: SellableItem;
}

const itemKey = (productId: string, variantId: string | null) => `${productId}|${variantId ?? ''}`;

/** "Printed Cotton Kurti (K-21 · M · Mustard)" */
export function itemLabel(item: SellableItem): string {
  const details = [item.designNo, item.sizeName, item.colorName].filter(Boolean).join(' · ');
  return details ? `${item.productName} (${details})` : item.productName;
}

export class SalesService {
  constructor(
    private readonly sales = new SalesRepository(),
    private readonly settings = new ShopSettingsRepository(),
    private readonly stock = new StockService(),
  ) {}

  lookupItems(query: ItemLookupQuery): Promise<SellableItem[]> {
    return this.sales.lookupItems(query.code);
  }

  searchItems(query: ItemSearchQuery): Promise<SellableItem[]> {
    return this.sales.searchItems(query.search, query.limit);
  }

  list(query: InvoiceListQuery): Promise<Paged<InvoiceSummary>> {
    return this.sales.list(query);
  }

  async get(id: string): Promise<Invoice> {
    return (await this.sales.findById(id)) ?? notFound();
  }

  /**
   * Saves a bill. Prices, tax and totals are recomputed from the database — the client only
   * says what was sold, how many, the discount and how it was paid.
   */
  create(input: InvoiceInput, author: BillAuthor): Promise<Invoice> {
    return withTransaction(async (tx) => {
      const lines = await this.checkLines(tx, input.items);
      const customer = input.customerId ? await this.checkCustomer(tx, input.customerId) : null;
      const seller = await this.settings.get(tx);
      const supplyType = supplyTypeFor(seller, customer);

      const bill = calculateBill(
        lines.map(({ input: line, item }) => ({
          unitPrice: item.unitPrice,
          quantity: line.quantity,
          discountPercent: line.discountPercent,
          gstRate: item.gstRate,
        })),
        supplyType,
      );
      const settlement = settlePayments(input.payments, bill.totals.grandTotal);
      if (!settlement.ok) {
        throw AppError.validation(settlement.message, 'payments');
      }

      const invoiceDate = await this.sales.today(tx);
      const financialYear = financialYearOf(invoiceDate);
      const sequenceNo = await this.sales.nextSequence(tx, financialYear);

      const invoiceNo = formatInvoiceNo(financialYear, sequenceNo);
      const id = await this.sales.insertInvoice(tx, {
        invoiceNo,
        financialYear,
        sequenceNo,
        invoiceDate,
        seller,
        customer,
        supplyType,
        totals: bill.totals,
        amountReceived: settlement.amountReceived,
        changeReturned: settlement.changeReturned,
        createdBy: author,
        lines: lines.map(({ input: line, item }, index) => ({
          item,
          quantity: line.quantity,
          discountPercent: line.discountPercent,
          amounts: bill.lines[index],
        })),
        payments: input.payments,
      });
      // Sold goods leave stock (it may go below zero — goods sold before being entered).
      await this.stock.record(
        tx,
        { type: 'sales_invoice', id, no: invoiceNo, date: invoiceDate, kind: 'sale' },
        lines.map(({ input: line, item }, index) => ({
          productId: item.productId,
          variantId: item.variantId,
          lineNo: index + 1,
          quantity: -line.quantity,
        })),
      );
      return (await this.sales.findById(id, tx)) ?? notFound();
    });
  }

  /** Every line must be a sellable, active item at the price the counter showed. */
  private async checkLines(
    tx: TransactionClient,
    items: readonly InvoiceItemInput[],
  ): Promise<CheckedLine[]> {
    const catalogue = await this.sales.findItemsOfProducts(
      tx,
      items.map((line) => line.productId),
    );
    const byKey = new Map(catalogue.map((item) => [itemKey(item.productId, item.variantId), item]));
    const withVariants = new Set(
      catalogue.filter((item) => item.variantId).map((item) => item.productId),
    );

    return items.map((line, index) => {
      const field = (name: string) => `items.${index}.${name}`;
      const item = byKey.get(itemKey(line.productId, line.variantId));
      if (!item) {
        if (!line.variantId && withVariants.has(line.productId)) {
          throw AppError.validation(
            `Line ${index + 1}: choose a size / colour of this product.`,
            field('variantId'),
          );
        }
        throw AppError.validation(
          `Line ${index + 1}: this item no longer exists. Remove it from the bill.`,
          field('productId'),
        );
      }
      const label = itemLabel(item);
      if (item.status !== 'active') {
        throw AppError.validation(
          `${label} is inactive and cannot be billed. Remove it from the bill.`,
          field('productId'),
        );
      }
      if (item.productType !== 'fabric' && !Number.isInteger(line.quantity)) {
        throw AppError.validation(
          `${label}: quantity must be a whole number (decimals are only for fabric).`,
          field('quantity'),
        );
      }
      if (line.unitPrice !== item.unitPrice) {
        throw AppError.validation(
          `The price of ${label} has changed to ₹${formatRupees(item.unitPrice)}. ` +
            'Check the bill and save again.',
          field('unitPrice'),
        );
      }
      return { input: line, item };
    });
  }

  private async checkCustomer(tx: TransactionClient, id: string): Promise<BillCustomer> {
    const customer = await this.sales.findCustomer(tx, id);
    if (!customer) {
      throw AppError.validation('The selected customer does not exist.', 'customerId');
    }
    if (customer.status !== 'active') {
      throw AppError.validation(
        `${customer.name} is an inactive customer. Activate the customer or bill as walk-in.`,
        'customerId',
      );
    }
    return customer;
  }
}

/**
 * IGST applies when a registered (GSTIN) customer belongs to another state than the shop;
 * otherwise the bill carries CGST + SGST.
 */
export function supplyTypeFor(seller: ShopProfile, customer: BillCustomer | null): SupplyType {
  if (!customer?.gstNumber || !seller.state) {
    return 'intra';
  }
  const customerState = stateFromGstin(customer.gstNumber)?.name ?? customer.state;
  return customerState && customerState !== seller.state ? 'inter' : 'intra';
}

function notFound(): never {
  throw AppError.notFound('Bill not found.');
}

export const salesService = new SalesService();

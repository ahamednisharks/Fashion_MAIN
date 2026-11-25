import { type Queryable, type TransactionClient, pool } from '../../config/database.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import type { BillLineAmounts, BillTotals, SupplyType } from './bill-calculator.js';
import { ITEM_COLUMNS, ITEM_FROM, ITEM_ORDER, itemSelect } from '../items/item-sql.js';
import type { ShopProfile } from '../settings/shop-settings.schema.js';
import type {
  Invoice,
  InvoiceItem,
  InvoiceListQuery,
  InvoicePayment,
  InvoiceSummary,
  PaymentInput,
  SellableItem,
} from './sales.schema.js';

/** Bills are dated in the shop's local time. */
export const SHOP_TIME_ZONE = 'Asia/Kolkata';

const SUMMARY_COLUMNS = `
  si.id, si.invoice_no AS "invoiceNo", si.invoice_date::text AS "invoiceDate",
  si.customer_id AS "customerId", si.customer_name AS "customerName",
  si.customer_mobile AS "customerMobile", si.item_count AS "itemCount",
  si.total_quantity AS "totalQuantity", si.grand_total AS "grandTotal", si.status,
  si.created_by_name AS "createdByName", si.created_at AS "createdAt"`;

const INVOICE_COLUMNS = `${SUMMARY_COLUMNS},
  si.seller, si.customer_gst_number AS "customerGstNumber", si.customer_state AS "customerState",
  si.supply_type AS "supplyType", si.gross_amount AS "grossAmount",
  si.discount_total AS "discountTotal", si.taxable_total AS "taxableTotal",
  si.cgst_total AS "cgstTotal", si.sgst_total AS "sgstTotal", si.igst_total AS "igstTotal",
  si.round_off AS "roundOff", si.amount_received AS "amountReceived",
  si.change_returned AS "changeReturned", si.created_by AS "createdBy",
  si.updated_at AS "updatedAt"`;

const LINE_COLUMNS = `
  line_no AS "lineNo", product_id AS "productId", variant_id AS "variantId",
  product_name AS "productName", product_code AS "productCode", design_no AS "designNo",
  size_name AS "sizeName", color_name AS "colorName", sku, barcode, hsn_code AS "hsnCode",
  gst_rate AS "gstRate", mrp, unit_price AS "unitPrice", quantity,
  discount_percent AS "discountPercent", gross_amount AS "grossAmount",
  discount_amount AS "discountAmount", taxable_value AS "taxableValue",
  cgst_amount AS "cgstAmount", sgst_amount AS "sgstAmount", igst_amount AS "igstAmount",
  line_total AS "lineTotal"`;

export interface BillCustomer {
  id: string;
  name: string;
  mobile: string;
  gstNumber: string;
  state: string;
  status: 'active' | 'inactive';
}

/** Everything needed to insert a bill (numbers already allocated, amounts already computed). */
export interface NewInvoice {
  invoiceNo: string;
  financialYear: string;
  sequenceNo: number;
  invoiceDate: string;
  seller: ShopProfile;
  customer: BillCustomer | null;
  supplyType: SupplyType;
  totals: BillTotals;
  amountReceived: number;
  changeReturned: number;
  createdBy: { id: string; fullName: string };
  lines: {
    item: SellableItem;
    quantity: number;
    discountPercent: number;
    amounts: BillLineAmounts;
  }[];
  payments: PaymentInput[];
}

export class SalesRepository {
  constructor(private readonly db: Queryable = pool) {}

  // ---- Items -----------------------------------------------------------------------------------

  /**
   * Exact match for a scanned / typed code: variant barcode or SKU, product barcode or product
   * code (the last two return every variant of that product). Inactive products are included so
   * the counter can say why an item cannot be billed. `extraColumns` adds columns to each row
   * (purchase screens add the purchase price).
   */
  async lookupItems<T extends SellableItem = SellableItem>(
    code: string,
    extraColumns = '',
  ): Promise<T[]> {
    const result = await this.db.query<T>(
      `${itemSelect(extraColumns)}
        WHERE (v.barcode <> '' AND lower(v.barcode) = $1)
           OR lower(v.sku) = $1
           OR (p.barcode <> '' AND lower(p.barcode) = $1)
           OR lower(p.code) = $1
        ${ITEM_ORDER}
        LIMIT 200`,
      [code.toLowerCase()],
    );
    return result.rows;
  }

  /** Active items whose text contains every search word. */
  async searchItems<T extends SellableItem = SellableItem>(
    search: string,
    limit: number,
    extraColumns = '',
  ): Promise<T[]> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      search,
      (p) =>
        `concat_ws(' ', p.name, p.code, p.barcode, b.name, v.sku, v.barcode, v.design_no,
                   s.name, co.name) ILIKE ${p}`,
    );
    conditions.push(`p.status = 'active'`);
    const result = await this.db.query<T>(
      `${itemSelect(extraColumns)} ${whereClause(conditions)}
        ${ITEM_ORDER}
        LIMIT ${params.add(limit)}`,
      params.values,
    );
    return result.rows;
  }

  /** All sellable rows of these products (for validating a bill or a purchase order). */
  async findItemsOfProducts(db: Queryable, productIds: readonly string[]): Promise<SellableItem[]> {
    const result = await db.query<SellableItem>(
      `SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE p.id = ANY($1::uuid[]) ${ITEM_ORDER}`,
      [[...new Set(productIds)]],
    );
    return result.rows;
  }

  async findCustomer(db: Queryable, id: string): Promise<BillCustomer | null> {
    const result = await db.query<BillCustomer>(
      `SELECT id, name, mobile, gst_number AS "gstNumber", state, status
         FROM customers WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  // ---- Numbering ---------------------------------------------------------------------------------

  /** Today's date in the shop's time zone (YYYY-MM-DD), per the transaction clock. */
  async today(db: Queryable): Promise<string> {
    const result = await db.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE '${SHOP_TIME_ZONE}')::date::text AS today`,
    );
    return result.rows[0].today;
  }

  /**
   * Next bill number of the financial year. The counter row stays locked until the
   * transaction ends, so concurrent bills wait and a rolled-back bill leaves no gap.
   */
  async nextSequence(tx: TransactionClient, financialYear: string): Promise<number> {
    const result = await tx.query<{ lastNumber: number }>(
      `INSERT INTO invoice_counters (financial_year, last_number) VALUES ($1, 1)
       ON CONFLICT (financial_year) DO UPDATE SET last_number = invoice_counters.last_number + 1
       RETURNING last_number AS "lastNumber"`,
      [financialYear],
    );
    return result.rows[0].lastNumber;
  }

  // ---- Invoices ----------------------------------------------------------------------------------

  async insertInvoice(tx: TransactionClient, invoice: NewInvoice): Promise<string> {
    const { totals, customer } = invoice;
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO sales_invoices
         (invoice_no, financial_year, sequence_no, invoice_date, seller,
          customer_id, customer_name, customer_mobile, customer_gst_number, customer_state,
          supply_type, item_count, total_quantity, gross_amount, discount_total, taxable_total,
          cgst_total, sgst_total, igst_total, round_off, grand_total,
          amount_received, change_returned, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20, $21, $22, $23, $24, $25)
       RETURNING id`,
      [
        invoice.invoiceNo,
        invoice.financialYear,
        invoice.sequenceNo,
        invoice.invoiceDate,
        JSON.stringify(invoice.seller),
        customer?.id ?? null,
        customer?.name ?? '',
        customer?.mobile ?? '',
        customer?.gstNumber ?? '',
        customer?.state ?? '',
        invoice.supplyType,
        totals.itemCount,
        totals.totalQuantity,
        totals.grossAmount,
        totals.discountTotal,
        totals.taxableTotal,
        totals.cgstTotal,
        totals.sgstTotal,
        totals.igstTotal,
        totals.roundOff,
        totals.grandTotal,
        invoice.amountReceived,
        invoice.changeReturned,
        invoice.createdBy.id,
        invoice.createdBy.fullName,
      ],
    );
    const invoiceId = inserted.rows[0].id;

    for (const [index, line] of invoice.lines.entries()) {
      const { item, amounts } = line;
      await tx.query(
        `INSERT INTO sales_invoice_items
           (invoice_id, line_no, product_id, variant_id, product_name, product_code, design_no,
            size_name, color_name, sku, barcode, hsn_code, gst_rate, mrp, unit_price, quantity,
            discount_percent, gross_amount, discount_amount, taxable_value, cgst_amount,
            sgst_amount, igst_amount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24)`,
        [
          invoiceId,
          index + 1,
          item.productId,
          item.variantId,
          item.productName,
          item.productCode,
          item.designNo,
          item.sizeName,
          item.colorName,
          item.sku,
          item.barcode,
          item.hsnCode,
          item.gstRate,
          item.mrp,
          item.unitPrice,
          line.quantity,
          line.discountPercent,
          amounts.grossAmount,
          amounts.discountAmount,
          amounts.taxableValue,
          amounts.cgstAmount,
          amounts.sgstAmount,
          amounts.igstAmount,
          amounts.lineTotal,
        ],
      );
    }

    for (const [position, payment] of invoice.payments.entries()) {
      await tx.query(
        `INSERT INTO sales_invoice_payments (invoice_id, mode, amount, reference, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, payment.mode, payment.amount, payment.reference, position],
      );
    }
    return invoiceId;
  }

  async findById(id: string, db: Queryable = this.db): Promise<Invoice | null> {
    const header = await db.query<Omit<Invoice, 'items' | 'payments'>>(
      `SELECT ${INVOICE_COLUMNS} FROM sales_invoices si WHERE si.id = $1`,
      [id],
    );
    const invoice = header.rows[0];
    if (!invoice) {
      return null;
    }
    const items = await db.query<InvoiceItem>(
      `SELECT ${LINE_COLUMNS} FROM sales_invoice_items WHERE invoice_id = $1 ORDER BY line_no`,
      [id],
    );
    const payments = await db.query<InvoicePayment>(
      `SELECT mode, amount, reference FROM sales_invoice_payments
        WHERE invoice_id = $1 ORDER BY position, id`,
      [id],
    );
    return { ...invoice, items: items.rows, payments: payments.rows };
  }

  /** Newest first. */
  async list(query: InvoiceListQuery): Promise<Paged<InvoiceSummary>> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      query.search,
      (p) => `concat_ws(' ', si.invoice_no, si.customer_name, si.customer_mobile) ILIKE ${p}`,
    );
    if (query.date) conditions.push(`si.invoice_date = ${params.add(query.date)}::date`);
    if (query.from) conditions.push(`si.invoice_date >= ${params.add(query.from)}::date`);
    if (query.to) conditions.push(`si.invoice_date <= ${params.add(query.to)}::date`);
    const where = whereClause(conditions);

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM sales_invoices si ${where}`,
      params.values,
    );
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<InvoiceSummary>(
      `SELECT ${SUMMARY_COLUMNS},
              COALESCE((SELECT array_agg(DISTINCT sp.mode ORDER BY sp.mode)
                          FROM sales_invoice_payments sp WHERE sp.invoice_id = si.id),
                       '{}') AS "paymentModes"
         FROM sales_invoices si ${where}
        ORDER BY si.created_at DESC, si.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }
}

import { type Queryable, type TransactionClient, pool } from '../../config/database.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import { ITEM_COLUMNS, PURCHASE_PRICE_COLUMN, STOCK_JOIN } from '../items/item-sql.js';
import { SalesRepository } from '../sales/sales.repository.js';
import type { SellableItem } from '../sales/sales.schema.js';
import type { PoCalculation, SupplyType } from './po-calculator.js';
import type {
  Po,
  PoItem,
  PoListQuery,
  PoStatus,
  PoSummary,
  PurchasableItem,
  ReceivableOrder,
} from './purchase-orders.schema.js';

const SUMMARY_COLUMNS = `
  po.id, po.po_no AS "poNo", po.po_date::text AS "poDate",
  po.expected_date::text AS "expectedDate", po.supplier_id AS "supplierId",
  po.supplier_name AS "supplierName", po.item_count AS "itemCount",
  po.total_quantity AS "totalQuantity", po.grand_total AS "grandTotal", po.status,
  po.created_by_name AS "createdByName", po.created_at AS "createdAt"`;

const PO_COLUMNS = `${SUMMARY_COLUMNS},
  po.supplier_mobile AS "supplierMobile", po.supplier_gst_number AS "supplierGstNumber",
  po.supplier_address AS "supplierAddress", po.supplier_state AS "supplierState",
  po.supply_type AS "supplyType", po.notes, po.gross_amount AS "grossAmount",
  po.discount_total AS "discountTotal", po.taxable_total AS "taxableTotal",
  po.cgst_total AS "cgstTotal", po.sgst_total AS "sgstTotal", po.igst_total AS "igstTotal",
  po.round_off AS "roundOff", po.cancelled_at AS "cancelledAt", po.created_by AS "createdBy",
  po.updated_by_name AS "updatedByName", po.updated_at AS "updatedAt"`;

/** Line snapshot plus the product's current type (only fabric may have decimal quantities). */
const LINE_COLUMNS = `
  i.line_no AS "lineNo", i.product_id AS "productId", i.variant_id AS "variantId",
  i.product_name AS "productName", i.product_code AS "productCode", i.design_no AS "designNo",
  i.size_name AS "sizeName", i.color_name AS "colorName", i.sku, i.barcode,
  i.hsn_code AS "hsnCode", p.product_type AS "productType", i.gst_rate AS "gstRate",
  i.quantity, i.rate, i.discount_percent AS "discountPercent",
  i.gross_amount AS "grossAmount", i.discount_amount AS "discountAmount",
  i.taxable_value AS "taxableValue", i.cgst_amount AS "cgstAmount",
  i.sgst_amount AS "sgstAmount", i.igst_amount AS "igstAmount", i.line_total AS "lineTotal",
  i.received_quantity AS "receivedQuantity"`;

export interface PoSupplier {
  id: string;
  name: string;
  mobile: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  status: 'active' | 'inactive';
}

/** Lock row of an existing PO (taken before editing or cancelling it). */
export interface PoLock {
  status: PoStatus;
  financialYear: number;
  poNo: string;
  supplierId: string;
  received: boolean;
}

/** Everything needed to write a PO (numbers allocated and amounts computed by the service). */
export interface PoRecord {
  poDate: string;
  expectedDate: string | null;
  supplier: PoSupplier;
  supplyType: SupplyType;
  notes: string;
  calculation: PoCalculation;
  lines: { item: SellableItem; quantity: number; rate: number; discountPercent: number }[];
  userName: string;
}

/** "12 Main Road, Coimbatore - 641001" */
export function supplierAddress(supplier: PoSupplier): string {
  const cityLine = [supplier.city, supplier.pincode].filter(Boolean).join(' - ');
  return [supplier.address, cityLine].filter(Boolean).join(', ').slice(0, 400);
}

export class PurchaseOrdersRepository {
  private readonly catalogue: SalesRepository;

  constructor(private readonly db: Queryable = pool) {
    this.catalogue = new SalesRepository(db);
  }

  // ---- Items & supplier --------------------------------------------------------------------------

  lookupItems(code: string): Promise<PurchasableItem[]> {
    return this.catalogue.lookupItems<PurchasableItem>(code, PURCHASE_PRICE_COLUMN);
  }

  searchItems(search: string, limit: number): Promise<PurchasableItem[]> {
    return this.catalogue.searchItems<PurchasableItem>(search, limit, PURCHASE_PRICE_COLUMN);
  }

  findItemsOfProducts(db: Queryable, productIds: readonly string[]): Promise<SellableItem[]> {
    return this.catalogue.findItemsOfProducts(db, productIds);
  }

  today(db: Queryable = this.db): Promise<string> {
    return this.catalogue.today(db);
  }

  async findSupplier(db: Queryable, id: string): Promise<PoSupplier | null> {
    const result = await db.query<PoSupplier>(
      `SELECT id, name, mobile, gst_number AS "gstNumber", address, city, state, pincode, status
         FROM suppliers WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  // ---- Numbering ---------------------------------------------------------------------------------

  /**
   * Next number of a series in a financial year. The counter row stays locked until the
   * transaction ends, so concurrent saves wait and a rolled-back save leaves no gap.
   */
  async nextSequence(
    tx: TransactionClient,
    series: string,
    financialYear: number,
  ): Promise<number> {
    const result = await tx.query<{ lastNumber: number }>(
      `INSERT INTO document_counters (series, financial_year, last_number) VALUES ($1, $2, 1)
       ON CONFLICT (series, financial_year)
       DO UPDATE SET last_number = document_counters.last_number + 1
       RETURNING last_number AS "lastNumber"`,
      [series, financialYear],
    );
    return result.rows[0].lastNumber;
  }

  /** The number the next save would get (no lock — only a preview). */
  async peekSequence(series: string, financialYear: number): Promise<number> {
    const result = await this.db.query<{ lastNumber: number }>(
      `SELECT last_number AS "lastNumber" FROM document_counters
        WHERE series = $1 AND financial_year = $2`,
      [series, financialYear],
    );
    return (result.rows[0]?.lastNumber ?? 0) + 1;
  }

  // ---- Purchase orders ---------------------------------------------------------------------------

  async insert(
    tx: TransactionClient,
    number: { poNo: string; financialYear: number; sequenceNo: number },
    po: PoRecord,
    createdBy: string,
  ): Promise<string> {
    const params = headerParams(po);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO purchase_orders
         (po_date, expected_date, supplier_id, supplier_name, supplier_mobile,
          supplier_gst_number, supplier_address, supplier_state, supply_type, notes,
          item_count, total_quantity, gross_amount, discount_total, taxable_total,
          cgst_total, sgst_total, igst_total, round_off, grand_total, updated_by_name,
          po_no, financial_year, sequence_no, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24, $25, $26)
       RETURNING id`,
      [...params, number.poNo, number.financialYear, number.sequenceNo, createdBy, po.userName],
    );
    const id = inserted.rows[0].id;
    await this.insertLines(tx, id, po);
    return id;
  }

  /** Replaces the header and every line of an open PO. */
  async update(tx: TransactionClient, id: string, po: PoRecord): Promise<void> {
    await tx.query(
      `UPDATE purchase_orders
          SET po_date = $1, expected_date = $2, supplier_id = $3, supplier_name = $4,
              supplier_mobile = $5, supplier_gst_number = $6, supplier_address = $7,
              supplier_state = $8, supply_type = $9, notes = $10, item_count = $11,
              total_quantity = $12, gross_amount = $13, discount_total = $14,
              taxable_total = $15, cgst_total = $16, sgst_total = $17, igst_total = $18,
              round_off = $19, grand_total = $20, updated_by_name = $21
        WHERE id = $22`,
      [...headerParams(po), id],
    );
    await tx.query('DELETE FROM purchase_order_items WHERE po_id = $1', [id]);
    await this.insertLines(tx, id, po);
  }

  async cancel(tx: TransactionClient, id: string, userName: string): Promise<void> {
    await tx.query(
      `UPDATE purchase_orders
          SET status = 'cancelled', cancelled_at = now(), updated_by_name = $2
        WHERE id = $1`,
      [id, userName],
    );
  }

  /** Locks the PO row for the rest of the transaction. */
  async lock(tx: TransactionClient, id: string): Promise<PoLock | null> {
    const result = await tx.query<PoLock>(
      `SELECT po.status, po.financial_year AS "financialYear", po.po_no AS "poNo",
              po.supplier_id AS "supplierId",
              EXISTS (SELECT 1 FROM purchase_order_items i
                       WHERE i.po_id = po.id AND i.received_quantity > 0) AS received
         FROM purchase_orders po WHERE po.id = $1 FOR UPDATE`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string, db: Queryable = this.db): Promise<Po | null> {
    const header = await db.query<Omit<Po, 'items'>>(
      `SELECT ${PO_COLUMNS} FROM purchase_orders po WHERE po.id = $1`,
      [id],
    );
    const po = header.rows[0];
    if (!po) {
      return null;
    }
    const items = await db.query<PoItem>(
      `SELECT ${LINE_COLUMNS}
         FROM purchase_order_items i JOIN products p ON p.id = i.product_id
        WHERE i.po_id = $1 ORDER BY i.line_no`,
      [id],
    );
    return { ...po, items: items.rows };
  }

  /** Newest first. */
  async list(query: PoListQuery): Promise<Paged<PoSummary>> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      query.search,
      (p) => `concat_ws(' ', po.po_no, po.supplier_name, po.supplier_mobile) ILIKE ${p}`,
    );
    if (query.status) conditions.push(`po.status = ${params.add(query.status)}`);
    if (query.supplierId) conditions.push(`po.supplier_id = ${params.add(query.supplierId)}`);
    if (query.from) conditions.push(`po.po_date >= ${params.add(query.from)}::date`);
    if (query.to) conditions.push(`po.po_date <= ${params.add(query.to)}::date`);
    const where = whereClause(conditions);

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM purchase_orders po ${where}`,
      params.values,
    );
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<PoSummary>(
      `SELECT ${SUMMARY_COLUMNS} FROM purchase_orders po ${where}
        ORDER BY po.po_date DESC, po.created_at DESC, po.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }

  // ---- Receiving (Purchase Entry) ------------------------------------------------------------

  /** Open and partly received POs (of one supplier, or all), newest first. */
  async listReceivable(supplierId?: string): Promise<PoSummary[]> {
    const result = await this.db.query<PoSummary>(
      `SELECT ${SUMMARY_COLUMNS} FROM purchase_orders po
        WHERE po.status IN ('open', 'partial') AND ($1::uuid IS NULL OR po.supplier_id = $1)
        ORDER BY po.po_date DESC, po.created_at DESC, po.id DESC
        LIMIT 200`,
      [supplierId ?? null],
    );
    return result.rows;
  }

  /**
   * A PO with its lines as items to receive: the item as it is now (prices, status) plus what
   * was ordered and what has been received so far.
   */
  async findReceivable(id: string, db: Queryable = this.db): Promise<ReceivableOrder | null> {
    const header = await db.query<Omit<ReceivableOrder, 'items'>>(
      `SELECT po.id, po.po_no AS "poNo", po.po_date::text AS "poDate", po.status,
              po.supplier_id AS "supplierId", po.supplier_name AS "supplierName",
              po.supplier_mobile AS "supplierMobile", po.supplier_gst_number AS "supplierGstNumber",
              po.supplier_address AS "supplierAddress", po.supplier_state AS "supplierState"
         FROM purchase_orders po WHERE po.id = $1`,
      [id],
    );
    const order = header.rows[0];
    if (!order) {
      return null;
    }
    const lines = await db.query<ReceivableOrder['items'][number]>(
      `SELECT ${ITEM_COLUMNS}, ${PURCHASE_PRICE_COLUMN},
              i.line_no AS "lineNo", i.quantity AS "orderedQuantity",
              i.received_quantity AS "receivedQuantity", i.rate,
              i.discount_percent AS "discountPercent"
         FROM purchase_order_items i
         JOIN products p ON p.id = i.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN product_variants v ON v.id = i.variant_id
         LEFT JOIN sizes s ON s.id = v.size_id
         LEFT JOIN colors co ON co.id = v.color_id
         ${STOCK_JOIN}
        WHERE i.po_id = $1 ORDER BY i.line_no`,
      [id],
    );
    return { ...order, items: lines.rows };
  }

  /** Locks POs (in id order, so concurrent entries cannot deadlock) for receiving. */
  async lockForReceipt(
    tx: TransactionClient,
    ids: readonly string[],
  ): Promise<{ id: string; poNo: string; supplierId: string; status: PoStatus }[]> {
    const result = await tx.query<{
      id: string;
      poNo: string;
      supplierId: string;
      status: PoStatus;
    }>(
      `SELECT id, po_no AS "poNo", supplier_id AS "supplierId", status
         FROM purchase_orders WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [[...new Set(ids)]],
    );
    return result.rows;
  }

  private async insertLines(tx: TransactionClient, poId: string, po: PoRecord): Promise<void> {
    for (const [index, line] of po.lines.entries()) {
      const { item } = line;
      const amounts = po.calculation.lines[index];
      await tx.query(
        `INSERT INTO purchase_order_items
           (po_id, line_no, product_id, variant_id, product_name, product_code, design_no,
            size_name, color_name, sku, barcode, hsn_code, gst_rate, quantity, rate,
            discount_percent, gross_amount, discount_amount, taxable_value, cgst_amount,
            sgst_amount, igst_amount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23)`,
        [
          poId,
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
          line.quantity,
          line.rate,
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
  }
}

/** $1…$21 shared by INSERT and UPDATE. */
function headerParams(po: PoRecord): unknown[] {
  const { totals } = po.calculation;
  const { supplier } = po;
  return [
    po.poDate,
    po.expectedDate,
    supplier.id,
    supplier.name,
    supplier.mobile,
    supplier.gstNumber,
    supplierAddress(supplier),
    supplier.state,
    po.supplyType,
    po.notes,
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
    po.userName,
  ];
}

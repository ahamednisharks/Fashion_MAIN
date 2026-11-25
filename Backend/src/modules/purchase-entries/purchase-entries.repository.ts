import { type Queryable, type TransactionClient, pool } from '../../config/database.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import { ITEM_COLUMNS, STOCK_JOIN } from '../items/item-sql.js';
import type { PoCalculation, SupplyType } from '../purchase-orders/po-calculator.js';
import {
  type PoSupplier,
  PurchaseOrdersRepository,
  supplierAddress,
} from '../purchase-orders/purchase-orders.repository.js';
import type { SellableItem } from '../sales/sales.schema.js';
import type {
  Pe,
  PeItem,
  PeLabelItem,
  PeListQuery,
  PeStatus,
  PeSummary,
} from './purchase-entries.schema.js';

const FROM = 'FROM purchase_entries pe LEFT JOIN purchase_orders po ON po.id = pe.po_id';

const SUMMARY_COLUMNS = `
  pe.id, pe.pe_no AS "peNo", pe.entry_date::text AS "entryDate",
  pe.supplier_id AS "supplierId", pe.supplier_name AS "supplierName",
  pe.supplier_invoice_no AS "supplierInvoiceNo",
  pe.supplier_invoice_date::text AS "supplierInvoiceDate",
  pe.po_id AS "purchaseOrderId", po.po_no AS "poNo", pe.item_count AS "itemCount",
  pe.total_quantity AS "totalQuantity", pe.grand_total AS "grandTotal", pe.status,
  pe.created_by_name AS "createdByName", pe.created_at AS "createdAt"`;

const ENTRY_COLUMNS = `${SUMMARY_COLUMNS},
  pe.supplier_mobile AS "supplierMobile", pe.supplier_gst_number AS "supplierGstNumber",
  pe.supplier_address AS "supplierAddress", pe.supplier_state AS "supplierState",
  pe.supply_type AS "supplyType", pe.notes, pe.gross_amount AS "grossAmount",
  pe.discount_total AS "discountTotal", pe.taxable_total AS "taxableTotal",
  pe.cgst_total AS "cgstTotal", pe.sgst_total AS "sgstTotal", pe.igst_total AS "igstTotal",
  pe.round_off AS "roundOff", pe.bill_amount AS "billAmount",
  pe.cancelled_at AS "cancelledAt", pe.created_by AS "createdBy",
  pe.updated_by_name AS "updatedByName", pe.updated_at AS "updatedAt"`;

/** Line snapshot, the product's current type and the quantity ordered on the linked PO. */
const LINE_COLUMNS = `
  i.line_no AS "lineNo", i.product_id AS "productId", i.variant_id AS "variantId",
  i.product_name AS "productName", i.product_code AS "productCode", i.design_no AS "designNo",
  i.size_name AS "sizeName", i.color_name AS "colorName", i.sku, i.barcode,
  i.hsn_code AS "hsnCode", p.product_type AS "productType", i.gst_rate AS "gstRate",
  i.quantity, i.rate, i.discount_percent AS "discountPercent",
  i.gross_amount AS "grossAmount", i.discount_amount AS "discountAmount",
  i.taxable_value AS "taxableValue", i.cgst_amount AS "cgstAmount",
  i.sgst_amount AS "sgstAmount", i.igst_amount AS "igstAmount", i.line_total AS "lineTotal",
  i.mrp, i.selling_price AS "sellingPrice", poi.quantity AS "orderedQuantity"`;

/** PO lines are matched to entry lines by item (a PO lists each item once). */
const SAME_ITEM = (a: string, b: string) =>
  `${a}.product_id = ${b}.product_id AND ${a}.variant_id IS NOT DISTINCT FROM ${b}.variant_id`;

/** Lock row of an existing entry (taken before editing or cancelling it). */
export interface PeLock {
  status: PeStatus;
  financialYear: number;
  peNo: string;
  supplierId: string;
  purchaseOrderId: string | null;
  /** productId|variantId of its lines. */
  itemKeys: string[];
}

export interface PeLineRecord {
  item: SellableItem;
  quantity: number;
  rate: number;
  discountPercent: number;
  mrp: number;
  sellingPrice: number;
}

/** Everything needed to write an entry (number allocated and amounts computed by the service). */
export interface PeRecord {
  entryDate: string;
  supplier: PoSupplier;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  purchaseOrderId: string | null;
  supplyType: SupplyType;
  notes: string;
  billAmount: number | null;
  calculation: PoCalculation;
  lines: PeLineRecord[];
  userName: string;
}

export class PurchaseEntriesRepository {
  /** Items, suppliers, numbering and PO receiving are shared with purchase orders. */
  readonly orders: PurchaseOrdersRepository;

  constructor(private readonly db: Queryable = pool) {
    this.orders = new PurchaseOrdersRepository(db);
  }

  // ---- Entries -----------------------------------------------------------------------------------

  async insert(
    tx: TransactionClient,
    number: { peNo: string; financialYear: number; sequenceNo: number },
    entry: PeRecord,
    createdBy: string,
  ): Promise<string> {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO purchase_entries
         (entry_date, supplier_id, supplier_name, supplier_mobile, supplier_gst_number,
          supplier_address, supplier_state, supplier_invoice_no, supplier_invoice_date, po_id,
          supply_type, notes, item_count, total_quantity, gross_amount, discount_total,
          taxable_total, cgst_total, sgst_total, igst_total, round_off, grand_total, bill_amount,
          updated_by_name, pe_no, financial_year, sequence_no, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
       RETURNING id`,
      [
        ...headerParams(entry),
        number.peNo,
        number.financialYear,
        number.sequenceNo,
        createdBy,
        entry.userName,
      ],
    );
    const id = inserted.rows[0].id;
    await this.insertLines(tx, id, entry);
    return id;
  }

  /** Replaces the header and every line of a saved entry. */
  async update(tx: TransactionClient, id: string, entry: PeRecord): Promise<void> {
    await tx.query(
      `UPDATE purchase_entries
          SET entry_date = $1, supplier_id = $2, supplier_name = $3, supplier_mobile = $4,
              supplier_gst_number = $5, supplier_address = $6, supplier_state = $7,
              supplier_invoice_no = $8, supplier_invoice_date = $9, po_id = $10,
              supply_type = $11, notes = $12, item_count = $13, total_quantity = $14,
              gross_amount = $15, discount_total = $16, taxable_total = $17, cgst_total = $18,
              sgst_total = $19, igst_total = $20, round_off = $21, grand_total = $22,
              bill_amount = $23, updated_by_name = $24
        WHERE id = $25`,
      [...headerParams(entry), id],
    );
    await tx.query('DELETE FROM purchase_entry_items WHERE entry_id = $1', [id]);
    await this.insertLines(tx, id, entry);
  }

  async cancel(tx: TransactionClient, id: string, userName: string): Promise<void> {
    await tx.query(
      `UPDATE purchase_entries
          SET status = 'cancelled', cancelled_at = now(), updated_by_name = $2
        WHERE id = $1`,
      [id, userName],
    );
  }

  /** Locks the entry row for the rest of the transaction. */
  async lock(tx: TransactionClient, id: string): Promise<PeLock | null> {
    const result = await tx.query<PeLock>(
      `SELECT pe.status, pe.financial_year AS "financialYear", pe.pe_no AS "peNo",
              pe.supplier_id AS "supplierId", pe.po_id AS "purchaseOrderId",
              ARRAY(SELECT i.product_id || '|' || COALESCE(i.variant_id::text, '')
                      FROM purchase_entry_items i WHERE i.entry_id = pe.id) AS "itemKeys"
         FROM purchase_entries pe WHERE pe.id = $1 FOR UPDATE`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** PE number of a saved entry with this supplier invoice number in the financial year. */
  async findInvoice(
    db: Queryable,
    supplierId: string,
    financialYear: number,
    invoiceNo: string,
    excludeId: string | null,
  ): Promise<string | null> {
    const result = await db.query<{ peNo: string }>(
      `SELECT pe_no AS "peNo" FROM purchase_entries
        WHERE supplier_id = $1 AND financial_year = $2 AND lower(supplier_invoice_no) = lower($3)
          AND status = 'posted' AND ($4::uuid IS NULL OR id <> $4)
        LIMIT 1`,
      [supplierId, financialYear, invoiceNo, excludeId],
    );
    return result.rows[0]?.peNo ?? null;
  }

  async findById(id: string, db: Queryable = this.db): Promise<Pe | null> {
    const header = await db.query<Omit<Pe, 'items'>>(
      `SELECT ${ENTRY_COLUMNS} ${FROM} WHERE pe.id = $1`,
      [id],
    );
    const entry = header.rows[0];
    if (!entry) {
      return null;
    }
    const items = await db.query<PeItem>(
      `SELECT ${LINE_COLUMNS}
         FROM purchase_entry_items i
         JOIN purchase_entries pe ON pe.id = i.entry_id
         JOIN products p ON p.id = i.product_id
         LEFT JOIN purchase_order_items poi ON poi.po_id = pe.po_id AND ${SAME_ITEM('poi', 'i')}
        WHERE i.entry_id = $1 ORDER BY i.line_no`,
      [id],
    );
    return { ...entry, items: items.rows };
  }

  /** Newest first. */
  async list(query: PeListQuery): Promise<Paged<PeSummary>> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      query.search,
      (p) =>
        `concat_ws(' ', pe.pe_no, pe.supplier_name, pe.supplier_mobile, pe.supplier_invoice_no,
                   po.po_no) ILIKE ${p}`,
    );
    if (query.status) conditions.push(`pe.status = ${params.add(query.status)}`);
    if (query.supplierId) conditions.push(`pe.supplier_id = ${params.add(query.supplierId)}`);
    if (query.purchaseOrderId) conditions.push(`pe.po_id = ${params.add(query.purchaseOrderId)}`);
    if (query.from) conditions.push(`pe.entry_date >= ${params.add(query.from)}::date`);
    if (query.to) conditions.push(`pe.entry_date <= ${params.add(query.to)}::date`);
    const where = whereClause(conditions);

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total ${FROM} ${where}`,
      params.values,
    );
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<PeSummary>(
      `SELECT ${SUMMARY_COLUMNS} ${FROM} ${where}
        ORDER BY pe.entry_date DESC, pe.created_at DESC, pe.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }

  /** The entry's items as they are now (current barcode and prices), one label per piece. */
  async labelItems(id: string): Promise<PeLabelItem[]> {
    const result = await this.db.query<PeLabelItem>(
      `SELECT ${ITEM_COLUMNS},
              CASE WHEN p.product_type = 'fabric' THEN 1 ELSE ceil(i.quantity)::int END AS copies
         FROM purchase_entry_items i
         JOIN products p ON p.id = i.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN product_variants v ON v.id = i.variant_id
         LEFT JOIN sizes s ON s.id = v.size_id
         LEFT JOIN colors co ON co.id = v.color_id
         ${STOCK_JOIN}
        WHERE i.entry_id = $1 ORDER BY i.line_no`,
      [id],
    );
    return result.rows;
  }

  // ---- Effects on the PO and the items -------------------------------------------------------------

  /**
   * Recomputes a PO's received quantities from its saved entries, then its status:
   * nothing received → open, everything → received, otherwise partial (cancelled POs stay).
   */
  async refreshOrderReceipts(tx: TransactionClient, poId: string): Promise<void> {
    await tx.query(
      `UPDATE purchase_order_items poi
          SET received_quantity = COALESCE((
                SELECT sum(i.quantity)
                  FROM purchase_entry_items i
                  JOIN purchase_entries pe ON pe.id = i.entry_id
                 WHERE pe.po_id = poi.po_id AND pe.status = 'posted' AND ${SAME_ITEM('i', 'poi')}
              ), 0)
        WHERE poi.po_id = $1`,
      [poId],
    );
    await tx.query(
      `UPDATE purchase_orders po
          SET status = CASE
                WHEN NOT EXISTS (SELECT 1 FROM purchase_order_items i
                                  WHERE i.po_id = po.id AND i.received_quantity > 0) THEN 'open'
                WHEN NOT EXISTS (SELECT 1 FROM purchase_order_items i
                                  WHERE i.po_id = po.id AND i.received_quantity < i.quantity)
                  THEN 'received'
                ELSE 'partial'
              END
        WHERE po.id = $1 AND po.status <> 'cancelled'`,
      [poId],
    );
  }

  /**
   * Gives each item the entry's purchase rate, MRP and selling price where they differ from
   * what the item has now: a variant gets its own price (override), a product without
   * variants gets new product prices. Rows that already match are left untouched.
   */
  async applyItemPrices(tx: TransactionClient, lines: readonly PeLineRecord[]): Promise<void> {
    for (const line of lines) {
      const { item } = line;
      const values = [line.rate, line.mrp, line.sellingPrice];
      if (item.variantId) {
        await tx.query(
          `UPDATE product_variants v
              SET purchase_price = CASE WHEN COALESCE(v.purchase_price, p.purchase_price)
                                             IS DISTINCT FROM $2 THEN $2 ELSE v.purchase_price END,
                  mrp = CASE WHEN COALESCE(v.mrp, p.mrp) <> $3 THEN $3 ELSE v.mrp END,
                  selling_price = CASE WHEN COALESCE(v.selling_price, p.selling_price) <> $4
                                       THEN $4 ELSE v.selling_price END
             FROM products p
            WHERE v.id = $1 AND p.id = v.product_id
              AND (COALESCE(v.purchase_price, p.purchase_price) IS DISTINCT FROM $2
                   OR COALESCE(v.mrp, p.mrp) <> $3
                   OR COALESCE(v.selling_price, p.selling_price) <> $4)`,
          [item.variantId, ...values],
        );
      } else {
        await tx.query(
          `UPDATE products SET purchase_price = $2, mrp = $3, selling_price = $4
            WHERE id = $1
              AND (purchase_price IS DISTINCT FROM $2 OR mrp <> $3 OR selling_price <> $4)`,
          [item.productId, ...values],
        );
      }
    }
  }

  private async insertLines(
    tx: TransactionClient,
    entryId: string,
    entry: PeRecord,
  ): Promise<void> {
    for (const [index, line] of entry.lines.entries()) {
      const { item } = line;
      const amounts = entry.calculation.lines[index];
      await tx.query(
        `INSERT INTO purchase_entry_items
           (entry_id, line_no, product_id, variant_id, product_name, product_code, design_no,
            size_name, color_name, sku, barcode, hsn_code, gst_rate, quantity, rate,
            discount_percent, gross_amount, discount_amount, taxable_value, cgst_amount,
            sgst_amount, igst_amount, line_total, mrp, selling_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25)`,
        [
          entryId,
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
          line.mrp,
          line.sellingPrice,
        ],
      );
    }
  }
}

/** $1…$24 shared by INSERT and UPDATE. */
function headerParams(entry: PeRecord): unknown[] {
  const { totals } = entry.calculation;
  const { supplier } = entry;
  return [
    entry.entryDate,
    supplier.id,
    supplier.name,
    supplier.mobile,
    supplier.gstNumber,
    supplierAddress(supplier),
    supplier.state,
    entry.supplierInvoiceNo,
    entry.supplierInvoiceDate,
    entry.purchaseOrderId,
    entry.supplyType,
    entry.notes,
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
    entry.billAmount,
    entry.userName,
  ];
}

import { type Queryable, type TransactionClient, pool } from '../../config/database.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import { ITEM_ORDER, ITEM_STOCK, PURCHASE_PRICE_COLUMN, itemSelect } from '../items/item-sql.js';
import { PurchaseOrdersRepository } from '../purchase-orders/purchase-orders.repository.js';
import type { PurchasableItem } from '../purchase-orders/purchase-orders.schema.js';
import type { SellableItem } from '../sales/sales.schema.js';
import type {
  Adjustment,
  AdjustmentItem,
  AdjustmentItemsQuery,
  AdjustmentListQuery,
  AdjustmentMode,
  AdjustmentReason,
  AdjustmentStatus,
  AdjustmentSummary,
} from './stock-adjustments.schema.js';

const SUMMARY_COLUMNS = `
  a.id, a.adj_no AS "adjNo", a.adjustment_date::text AS "adjustmentDate", a.mode, a.reason,
  a.notes, a.item_count AS "itemCount", a.quantity_in AS "quantityIn",
  a.quantity_out AS "quantityOut", a.value_in AS "valueIn", a.value_out AS "valueOut", a.status,
  a.created_by_name AS "createdByName", a.created_at AS "createdAt"`;

const ADJUSTMENT_COLUMNS = `${SUMMARY_COLUMNS},
  a.cancelled_at AS "cancelledAt", a.cancelled_by_name AS "cancelledByName",
  a.created_by AS "createdBy", a.updated_at AS "updatedAt"`;

/** Line snapshot plus the product's current type. */
const LINE_COLUMNS = `
  i.line_no AS "lineNo", i.product_id AS "productId", i.variant_id AS "variantId",
  i.product_name AS "productName", i.product_code AS "productCode", i.design_no AS "designNo",
  i.size_name AS "sizeName", i.color_name AS "colorName", i.sku, i.barcode,
  p.product_type AS "productType", i.system_quantity AS "systemQuantity",
  i.counted_quantity AS "countedQuantity", i.quantity, i.unit_cost AS "unitCost", i.value,
  i.note`;

/** Lock row of an existing adjustment (taken before cancelling it). */
export interface AdjustmentLock {
  status: AdjustmentStatus;
  adjNo: string;
}

export interface AdjustmentLineRecord {
  item: SellableItem;
  systemQuantity: number;
  countedQuantity: number | null;
  /** Change to stock, signed. */
  quantity: number;
  unitCost: number | null;
  value: number;
  note: string;
}

export interface AdjustmentTotals {
  itemCount: number;
  quantityIn: number;
  quantityOut: number;
  valueIn: number;
  valueOut: number;
}

/** Everything needed to write an adjustment (number allocated and lines worked out). */
export interface AdjustmentRecord {
  adjustmentDate: string;
  mode: AdjustmentMode;
  reason: AdjustmentReason;
  notes: string;
  lines: AdjustmentLineRecord[];
  totals: AdjustmentTotals;
  userName: string;
}

export class StockAdjustmentsRepository {
  /** Items, today's date and document numbering are shared with purchase orders. */
  readonly catalogue: PurchaseOrdersRepository;

  constructor(private readonly db: Queryable = pool) {
    this.catalogue = new PurchaseOrdersRepository(db);
  }

  async insert(
    tx: TransactionClient,
    number: { adjNo: string; financialYear: number; sequenceNo: number },
    record: AdjustmentRecord,
    createdBy: string,
  ): Promise<string> {
    const { totals } = record;
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO stock_adjustments
         (adj_no, financial_year, sequence_no, adjustment_date, mode, reason, notes, item_count,
          quantity_in, quantity_out, value_in, value_out, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        number.adjNo,
        number.financialYear,
        number.sequenceNo,
        record.adjustmentDate,
        record.mode,
        record.reason,
        record.notes,
        totals.itemCount,
        totals.quantityIn,
        totals.quantityOut,
        totals.valueIn,
        totals.valueOut,
        createdBy,
        record.userName,
      ],
    );
    const id = inserted.rows[0].id;
    await this.insertLines(tx, id, record.lines);
    return id;
  }

  async cancel(tx: TransactionClient, id: string, userName: string): Promise<void> {
    await tx.query(
      `UPDATE stock_adjustments
          SET status = 'cancelled', cancelled_at = now(), cancelled_by_name = $2
        WHERE id = $1`,
      [id, userName],
    );
  }

  /** Locks the adjustment row for the rest of the transaction. */
  async lock(tx: TransactionClient, id: string): Promise<AdjustmentLock | null> {
    const result = await tx.query<AdjustmentLock>(
      `SELECT status, adj_no AS "adjNo" FROM stock_adjustments WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string, db: Queryable = this.db): Promise<Adjustment | null> {
    const header = await db.query<Omit<Adjustment, 'items'>>(
      `SELECT ${ADJUSTMENT_COLUMNS} FROM stock_adjustments a WHERE a.id = $1`,
      [id],
    );
    const adjustment = header.rows[0];
    if (!adjustment) {
      return null;
    }
    const items = await db.query<AdjustmentItem>(
      `SELECT ${LINE_COLUMNS}
         FROM stock_adjustment_items i
         JOIN products p ON p.id = i.product_id
        WHERE i.adjustment_id = $1 ORDER BY i.line_no`,
      [id],
    );
    return { ...adjustment, items: items.rows };
  }

  /** Newest first. */
  async list(query: AdjustmentListQuery): Promise<Paged<AdjustmentSummary>> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      query.search,
      (p) => `concat_ws(' ', a.adj_no, a.notes, a.created_by_name) ILIKE ${p}`,
    );
    if (query.reason) conditions.push(`a.reason = ${params.add(query.reason)}`);
    if (query.status) conditions.push(`a.status = ${params.add(query.status)}`);
    if (query.from) conditions.push(`a.adjustment_date >= ${params.add(query.from)}::date`);
    if (query.to) conditions.push(`a.adjustment_date <= ${params.add(query.to)}::date`);
    const where = whereClause(conditions);

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM stock_adjustments a ${where}`,
      params.values,
    );
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<AdjustmentSummary>(
      `SELECT ${SUMMARY_COLUMNS} FROM stock_adjustments a ${where}
        ORDER BY a.adjustment_date DESC, a.created_at DESC, a.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }

  /** Items of a category / brand / stock state, with their purchase price, in list order. */
  async items(query: AdjustmentItemsQuery): Promise<PurchasableItem[]> {
    const params = new SqlParams();
    const conditions: string[] = [];
    if (query.status !== 'all') conditions.push(`p.status = ${params.add(query.status)}`);
    if (query.categoryId) conditions.push(`p.category_id = ${params.add(query.categoryId)}`);
    if (query.brandId) conditions.push(`p.brand_id = ${params.add(query.brandId)}`);
    if (query.stock === 'in') conditions.push(`${ITEM_STOCK} > 0`);
    if (query.stock === 'out') conditions.push(`${ITEM_STOCK} <= 0`);
    if (query.stock === 'negative') conditions.push(`${ITEM_STOCK} < 0`);
    const result = await this.db.query<PurchasableItem>(
      `${itemSelect(PURCHASE_PRICE_COLUMN)} ${whereClause(conditions)}
        ${ITEM_ORDER}
        LIMIT ${params.add(query.limit)}`,
      params.values,
    );
    return result.rows;
  }

  private async insertLines(
    tx: TransactionClient,
    adjustmentId: string,
    lines: readonly AdjustmentLineRecord[],
  ): Promise<void> {
    if (!lines.length) return;
    // One statement for all lines: a whole category can be counted in one adjustment.
    const column = <T>(pick: (line: AdjustmentLineRecord) => T) => lines.map(pick);
    await tx.query(
      `INSERT INTO stock_adjustment_items
         (adjustment_id, line_no, product_id, variant_id, product_name, product_code, design_no,
          size_name, color_name, sku, barcode, system_quantity, counted_quantity, quantity,
          unit_cost, value, note)
       SELECT $1, t.n, t.product_id, t.variant_id, t.product_name, t.product_code, t.design_no,
              t.size_name, t.color_name, t.sku, t.barcode, t.system_quantity, t.counted_quantity,
              t.quantity, t.unit_cost, t.value, t.note
         FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[],
                     $8::text[], $9::text[], $10::text[], $11::numeric[], $12::numeric[],
                     $13::numeric[], $14::numeric[], $15::numeric[], $16::text[])
              WITH ORDINALITY
              AS t(product_id, variant_id, product_name, product_code, design_no, size_name,
                   color_name, sku, barcode, system_quantity, counted_quantity, quantity,
                   unit_cost, value, note, n)`,
      [
        adjustmentId,
        column((line) => line.item.productId),
        column((line) => line.item.variantId),
        column((line) => line.item.productName),
        column((line) => line.item.productCode),
        column((line) => line.item.designNo),
        column((line) => line.item.sizeName),
        column((line) => line.item.colorName),
        column((line) => line.item.sku),
        column((line) => line.item.barcode),
        column((line) => line.systemQuantity),
        column((line) => line.countedQuantity),
        column((line) => line.quantity),
        column((line) => line.unitCost),
        column((line) => line.value),
        column((line) => line.note),
      ],
    );
  }
}

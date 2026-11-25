import { type Queryable, type TransactionClient, pool } from '../../config/database.js';
import type { StockHistory, StockMovementKind, StockSourceType } from './stock.schema.js';

/** Arbitrary, project-specific seed so stock locks don't collide with other advisory locks. */
const STOCK_LOCK_SEED = 7_270_002;

/** An item: a product variant, or a product without variants (variantId null). */
export interface StockItem {
  readonly productId: string;
  readonly variantId: string | null;
}

/** The document a set of movements belongs to. */
export interface StockDocument {
  readonly type: StockSourceType;
  readonly id: string;
  /** e.g. PE-2026-00001, INV/26-27/00012 */
  readonly no: string;
  /** YYYY-MM-DD */
  readonly date: string;
  readonly kind: StockMovementKind;
}

export interface StockLine extends StockItem {
  readonly lineNo: number;
  /** + in, − out. */
  readonly quantity: number;
  /** Purchases: GST-exclusive cost per unit after discount. */
  readonly unitCost?: number | null;
}

export const stockItemKey = (item: StockItem) => `${item.productId}|${item.variantId ?? ''}`;

export class StockRepository {
  constructor(private readonly db: Queryable = pool) {}

  /** Items the document has movements for now. */
  async itemsOf(tx: TransactionClient, type: StockSourceType, id: string): Promise<StockItem[]> {
    const result = await tx.query<StockItem>(
      `SELECT DISTINCT product_id AS "productId", variant_id AS "variantId"
         FROM stock_movements WHERE source_type = $1 AND source_id = $2`,
      [type, id],
    );
    return result.rows;
  }

  /**
   * Locks items for the rest of the transaction, always in key order, so concurrent saves of
   * documents with the same items queue up instead of deadlocking.
   */
  async lockItems(tx: TransactionClient, items: readonly StockItem[]): Promise<void> {
    const keys = [...new Set(items.map(stockItemKey))].sort();
    for (const key of keys) {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, $2))', [
        `stock:${key}`,
        STOCK_LOCK_SEED,
      ]);
    }
  }

  async deleteMovements(tx: TransactionClient, type: StockSourceType, id: string): Promise<void> {
    await tx.query('DELETE FROM stock_movements WHERE source_type = $1 AND source_id = $2', [
      type,
      id,
    ]);
  }

  async insertMovements(
    tx: TransactionClient,
    document: StockDocument,
    lines: readonly StockLine[],
  ): Promise<void> {
    if (!lines.length) return;
    await tx.query(
      `INSERT INTO stock_movements
         (product_id, variant_id, quantity, source_line, unit_cost,
          movement_date, kind, source_type, source_id, source_no)
       SELECT t.product_id, t.variant_id, t.quantity, t.source_line, t.unit_cost,
              $6::date, $7, $8, $9::uuid, $10
         FROM unnest($1::uuid[], $2::uuid[], $3::numeric[], $4::smallint[], $5::numeric[])
              AS t(product_id, variant_id, quantity, source_line, unit_cost)`,
      [
        lines.map((line) => line.productId),
        lines.map((line) => line.variantId),
        lines.map((line) => line.quantity),
        lines.map((line) => line.lineNo),
        lines.map((line) => line.unitCost ?? null),
        document.date,
        document.kind,
        document.type,
        document.id,
        document.no,
      ],
    );
  }

  /** Sets each item's quantity in hand to the sum of its movements. */
  async refreshLevels(tx: TransactionClient, items: readonly StockItem[]): Promise<void> {
    if (!items.length) return;
    await tx.query(
      `INSERT INTO stock_levels AS sl (product_id, variant_id, quantity)
       SELECT k.product_id, k.variant_id,
              COALESCE((SELECT sum(m.quantity) FROM stock_movements m
                         WHERE m.product_id = k.product_id
                           AND stock_variant_key(m.variant_id) = stock_variant_key(k.variant_id)), 0)
         FROM unnest($1::uuid[], $2::uuid[]) AS k(product_id, variant_id)
       ON CONFLICT (product_id, stock_variant_key(variant_id))
       DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
        WHERE sl.quantity IS DISTINCT FROM EXCLUDED.quantity`,
      [items.map((item) => item.productId), items.map((item) => item.variantId)],
    );
  }

  /** Quantity in hand of each item, in the order given (0 when it never moved). */
  async levels(db: Queryable, items: readonly StockItem[]): Promise<number[]> {
    if (!items.length) return [];
    const result = await db.query<{ quantity: number }>(
      `SELECT COALESCE(sl.quantity, 0) AS quantity
         FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS k(product_id, variant_id, n)
         LEFT JOIN stock_levels sl
                ON sl.product_id = k.product_id
               AND stock_variant_key(sl.variant_id) = stock_variant_key(k.variant_id)
        ORDER BY k.n`,
      [items.map((item) => item.productId), items.map((item) => item.variantId)],
    );
    return result.rows.map((row) => row.quantity);
  }

  /** Quantity in hand of one item (0 when it never moved). */
  async level(item: StockItem, db: Queryable = this.db): Promise<number> {
    const result = await db.query<{ quantity: number }>(
      `SELECT quantity FROM stock_levels
        WHERE product_id = $1 AND stock_variant_key(variant_id) = stock_variant_key($2::uuid)`,
      [item.productId, item.variantId],
    );
    return result.rows[0]?.quantity ?? 0;
  }

  /** The item's latest movements, newest first, each with the balance after it. */
  async history(item: StockItem, limit: number): Promise<StockHistory['movements']> {
    const result = await this.db.query<StockHistory['movements'][number]>(
      `SELECT h.date, h.kind, h."sourceType", h."sourceId", h."sourceNo", h.quantity, h.balance,
              h."createdAt"
         FROM (
         SELECT m.movement_date::text AS date, m.kind, m.source_type AS "sourceType",
                m.source_id AS "sourceId", m.source_no AS "sourceNo", m.quantity,
                sum(m.quantity) OVER (ORDER BY m.movement_date, m.created_at, m.id) AS balance,
                m.created_at AS "createdAt", m.id
           FROM stock_movements m
          WHERE m.product_id = $1 AND stock_variant_key(m.variant_id) = stock_variant_key($2::uuid)
       ) h
       ORDER BY h.date DESC, h."createdAt" DESC, h.id DESC
       LIMIT $3`,
      [item.productId, item.variantId, limit],
    );
    return result.rows;
  }

  async itemExists(item: StockItem): Promise<boolean> {
    const result = await this.db.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM products p
          WHERE p.id = $1
            AND ($2::uuid IS NULL OR EXISTS (
                  SELECT 1 FROM product_variants v WHERE v.id = $2 AND v.product_id = p.id))
       ) AS found`,
      [item.productId, item.variantId],
    );
    return result.rows[0]?.found ?? false;
  }

  async countMovements(item: StockItem): Promise<number> {
    const result = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM stock_movements
        WHERE product_id = $1 AND stock_variant_key(variant_id) = stock_variant_key($2::uuid)`,
      [item.productId, item.variantId],
    );
    return result.rows[0]?.total ?? 0;
  }
}

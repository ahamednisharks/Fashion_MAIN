import { type Queryable, pool } from '../../config/database.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { orderByClause } from '../../common/utils/sorting.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import { ITEM_COLUMNS, ITEM_FROM, ITEM_TIEBREAKER } from '../items/item-sql.js';
import {
  MAX_STOCK_EXPORT_ROWS,
  type SalesDay,
  type SalesTotals,
  type StockReportQuery,
  type StockReportRow,
  type StockReportTotals,
} from './reports.schema.js';

type SalesRow = SalesDay & { isTotal: boolean };

// ---- Stock report --------------------------------------------------------------------------------

/**
 * Each item's stock movements up to the end of the period, summed: before the period (opening),
 * and in it by kind. $from / $to are the given placeholders. Sales are stored as − movements, so
 * `sold` flips the sign. closing = every movement up to `to` = opening + purchased − sold + adjusted.
 */
const stockMoves = (from: string, to: string) => `
  WITH moves AS (
    SELECT m.product_id, stock_variant_key(m.variant_id) AS variant_key,
           COALESCE(sum(m.quantity) FILTER (WHERE m.movement_date < ${from}::date), 0) AS opening,
           COALESCE(sum(m.quantity) FILTER (WHERE m.movement_date >= ${from}::date
                                              AND m.kind = 'purchase'), 0) AS purchased,
           COALESCE(-sum(m.quantity) FILTER (WHERE m.movement_date >= ${from}::date
                                               AND m.kind = 'sale'), 0) AS sold,
           COALESCE(sum(m.quantity) FILTER (WHERE m.movement_date >= ${from}::date
                                              AND m.kind = 'adjustment'), 0) AS adjusted,
           count(*) FILTER (WHERE m.movement_date >= ${from}::date) AS movements,
           sum(m.quantity) AS closing
      FROM stock_movements m
     WHERE m.movement_date <= ${to}::date
     GROUP BY m.product_id, stock_variant_key(m.variant_id)
  )`;

const STOCK_REPORT_FROM = `${ITEM_FROM}
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN moves mv ON mv.product_id = p.id AND mv.variant_key = stock_variant_key(v.id)`;

const OPENING = 'COALESCE(mv.opening, 0)';
const PURCHASED = 'COALESCE(mv.purchased, 0)';
const SOLD = 'COALESCE(mv.sold, 0)';
const ADJUSTED = 'COALESCE(mv.adjusted, 0)';
const CLOSING = 'COALESCE(mv.closing, 0)';
const PURCHASE_RATE = 'COALESCE(v.purchase_price, p.purchase_price)';
/** Stock below zero (sold before being entered) is worth nothing rather than a negative amount. */
const STOCK_VALUE = `round(GREATEST(${CLOSING}, 0) * COALESCE(${PURCHASE_RATE}, 0), 2)`;

const STOCK_REPORT_COLUMNS = `${ITEM_COLUMNS},
  c.name AS "categoryName", ${PURCHASE_RATE} AS "purchaseRate",
  ${OPENING} AS opening, ${PURCHASED} AS purchased, ${SOLD} AS sold, ${ADJUSTED} AS adjusted,
  ${CLOSING} AS closing, ${STOCK_VALUE} AS "stockValue"`;

const STOCK_REPORT_SORTABLE: Readonly<Record<string, string>> = {
  name: 'lower(p.name)',
  sku: 'lower(COALESCE(v.sku, p.code))',
  brandName: 'lower(b.name)',
  opening: OPENING,
  purchased: PURCHASED,
  sold: SOLD,
  adjusted: ADJUSTED,
  closing: CLOSING,
  stockValue: STOCK_VALUE,
};

/**
 * Per-bill amounts with that bill's payments split by mode. Only completed bills count, so
 * cancelled bills (a later feature) drop out of every report automatically.
 */
const COMPLETED_BILLS = `
  SELECT si.invoice_date, si.total_quantity, si.gross_amount, si.discount_total,
         si.taxable_total, si.cgst_total, si.sgst_total, si.igst_total, si.round_off,
         si.grand_total, si.change_returned, pay.cash, pay.upi, pay.card
    FROM sales_invoices si
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(sp.amount) FILTER (WHERE sp.mode = 'cash'), 0) AS cash,
             COALESCE(sum(sp.amount) FILTER (WHERE sp.mode = 'upi'), 0) AS upi,
             COALESCE(sum(sp.amount) FILTER (WHERE sp.mode = 'card'), 0) AS card
        FROM sales_invoice_payments sp
       WHERE sp.invoice_id = si.id
    ) pay
   WHERE si.status = 'completed'
     AND si.invoice_date BETWEEN $1::date AND $2::date`;

/** Money is summed as NUMERIC in the database, so totals are exact to the paisa. */
const TOTAL_COLUMNS = `
  count(*)::int AS "billCount",
  COALESCE(sum(total_quantity), 0) AS quantity,
  COALESCE(sum(gross_amount), 0) AS "grossAmount",
  COALESCE(sum(discount_total), 0) AS "discountTotal",
  COALESCE(sum(taxable_total), 0) AS "taxableTotal",
  COALESCE(sum(cgst_total), 0) AS "cgstTotal",
  COALESCE(sum(sgst_total), 0) AS "sgstTotal",
  COALESCE(sum(igst_total), 0) AS "igstTotal",
  COALESCE(sum(cgst_total + sgst_total + igst_total), 0) AS "gstTotal",
  COALESCE(sum(round_off), 0) AS "roundOff",
  COALESCE(sum(grand_total), 0) AS "netSales",
  COALESCE(round(sum(grand_total) / NULLIF(count(*), 0), 2), 0) AS "averageBill",
  -- Change is always paid back in cash (UPI / card can never exceed the bill).
  COALESCE(sum(cash) - sum(change_returned), 0) AS cash,
  COALESCE(sum(upi), 0) AS upi,
  COALESCE(sum(card), 0) AS card`;

export class ReportsRepository {
  constructor(private readonly db: Queryable = pool) {}

  /**
   * Sales per day (days without bills are skipped) plus the grand total of the period, in one
   * pass: ROLLUP adds the total row, which exists even when the period has no bills.
   */
  async salesByDay(from: string, to: string): Promise<{ totals: SalesTotals; days: SalesDay[] }> {
    const result = await this.db.query<SalesRow>(
      `WITH bills AS (${COMPLETED_BILLS})
       SELECT invoice_date::text AS date, GROUPING(invoice_date) = 1 AS "isTotal",
              ${TOTAL_COLUMNS}
         FROM bills
        GROUP BY ROLLUP (invoice_date)
        ORDER BY invoice_date NULLS LAST`,
      [from, to],
    );
    const days: SalesDay[] = [];
    let totals: SalesTotals | null = null;
    for (const { isTotal, date, ...amounts } of result.rows) {
      if (isTotal) {
        totals = amounts;
      } else {
        days.push({ date, ...amounts });
      }
    }
    return { totals: totals ?? emptyTotals(), days };
  }

  /** One page of the stock report, with totals over every matching item. */
  async stockReport(
    query: StockReportQuery,
  ): Promise<{ totals: StockReportTotals } & Paged<StockReportRow>> {
    const { params, sql } = stockReportFilters(query);
    const totals = await this.stockTotals(sql, params);
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<StockReportRow>(
      `${sql.moves} SELECT ${STOCK_REPORT_COLUMNS} ${STOCK_REPORT_FROM} ${sql.where}
       ${stockReportOrder(query)} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return {
      totals,
      ...toPaged(rows.rows, totals.itemCount, query.page, query.pageSize),
    };
  }

  /** Every matching item (at most MAX_STOCK_EXPORT_ROWS) for an Excel / PDF file. */
  async stockReportAll(
    query: StockReportQuery,
  ): Promise<{ totals: StockReportTotals; items: StockReportRow[]; truncated: boolean }> {
    const { params, sql } = stockReportFilters(query);
    const totals = await this.stockTotals(sql, params);
    const limit = params.add(MAX_STOCK_EXPORT_ROWS);
    const rows = await this.db.query<StockReportRow>(
      `${sql.moves} SELECT ${STOCK_REPORT_COLUMNS} ${STOCK_REPORT_FROM} ${sql.where}
       ${stockReportOrder(query)} LIMIT ${limit}`,
      params.values,
    );
    return { totals, items: rows.rows, truncated: totals.itemCount > rows.rows.length };
  }

  private async stockTotals(
    sql: { moves: string; where: string },
    params: SqlParams,
  ): Promise<StockReportTotals> {
    const result = await this.db.query<StockReportTotals>(
      `${sql.moves}
       SELECT count(*)::int AS "itemCount",
              COALESCE(sum(${OPENING}), 0) AS opening,
              COALESCE(sum(${PURCHASED}), 0) AS purchased,
              COALESCE(sum(${SOLD}), 0) AS sold,
              COALESCE(sum(${ADJUSTED}), 0) AS adjusted,
              COALESCE(sum(${CLOSING}), 0) AS closing,
              COALESCE(sum(${STOCK_VALUE}), 0) AS "stockValue"
         ${STOCK_REPORT_FROM} ${sql.where}`,
      params.values,
    );
    return (
      result.rows[0] ?? {
        itemCount: 0,
        opening: 0,
        purchased: 0,
        sold: 0,
        adjusted: 0,
        closing: 0,
        stockValue: 0,
      }
    );
  }
}

/** The period's movements CTE and the WHERE clause for the report's filters. */
function stockReportFilters(query: StockReportQuery): {
  params: SqlParams;
  sql: { moves: string; where: string };
} {
  const params = new SqlParams();
  const moves = stockMoves(params.add(query.from), params.add(query.to));
  const conditions = searchConditions(
    params,
    query.search,
    (p) =>
      `concat_ws(' ', p.name, p.code, p.barcode, b.name, c.name, v.sku, v.barcode, v.design_no,
                 s.name, co.name) ILIKE ${p}`,
  );
  if (query.status) conditions.push(`p.status = ${params.add(query.status)}`);
  if (query.brandId) conditions.push(`p.brand_id = ${params.add(query.brandId)}`);
  if (query.sizeId) conditions.push(`v.size_id = ${params.add(query.sizeId)}`);
  if (query.colorId) conditions.push(`v.color_id = ${params.add(query.colorId)}`);
  switch (query.stock) {
    case 'any':
      conditions.push(`(${OPENING} <> 0 OR COALESCE(mv.movements, 0) > 0)`);
      break;
    case 'in':
      conditions.push(`${CLOSING} > 0`);
      break;
    case 'out':
      conditions.push(`${CLOSING} <= 0`);
      break;
    case 'negative':
      conditions.push(`${CLOSING} < 0`);
      break;
    case 'all':
      break;
  }
  return { params, sql: { moves, where: whereClause(conditions) } };
}

function stockReportOrder(query: StockReportQuery): string {
  return orderByClause({
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    sortable: STOCK_REPORT_SORTABLE,
    defaultOrder: 'lower(p.name)',
    tiebreaker: ITEM_TIEBREAKER,
  });
}

export function emptyTotals(): SalesTotals {
  return {
    billCount: 0,
    quantity: 0,
    grossAmount: 0,
    discountTotal: 0,
    taxableTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 0,
    gstTotal: 0,
    roundOff: 0,
    netSales: 0,
    averageBill: 0,
    cash: 0,
    upi: 0,
    card: 0,
  };
}

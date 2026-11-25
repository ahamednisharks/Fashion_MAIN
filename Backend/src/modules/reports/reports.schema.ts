import { z } from 'zod';

import { pagedSchema } from '../../common/utils/pagination.js';
import { uuidField } from '../../common/validators/fields.js';
import { createListQuerySchema } from '../../common/validators/list-query.js';
import { sellableItemSchema } from '../sales/sales.schema.js';

/** Longest period one report may cover (a full financial year, leap years included). */
export const MAX_REPORT_DAYS = 366;

const DAY_MS = 86_400_000;

/** Calendar days from `from` to `to`, both included (YYYY-MM-DD strings). */
export function daysInRange(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD — both dates included, in the shop's local calendar. */
export const dateRangeShape = {
  from: z.iso.date({ error: 'From date must be a valid date (YYYY-MM-DD).' }),
  to: z.iso.date({ error: 'To date must be a valid date (YYYY-MM-DD).' }),
};

/** Refinement for report periods: `to` not before `from`, at most MAX_REPORT_DAYS long. */
export function checkDateRange(range: { from: string; to: string }, ctx: z.RefinementCtx): void {
  const days = daysInRange(range.from, range.to);
  if (days < 1) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'To date cannot be before From date.' });
  } else if (days > MAX_REPORT_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `A report can cover at most ${MAX_REPORT_DAYS} days. Choose a shorter period.`,
    });
  }
}

export const salesReportQuerySchema = z.object(dateRangeShape).superRefine(checkDateRange);
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;

/** Sums over completed bills (cancelled bills are left out). Amounts in rupees. */
export const salesTotalsSchema = z
  .object({
    billCount: z.number().int(),
    quantity: z.number().describe('Pieces / metres sold.'),
    grossAmount: z.number().describe('Value at the selling rate, before discount.'),
    discountTotal: z.number(),
    taxableTotal: z.number(),
    cgstTotal: z.number(),
    sgstTotal: z.number(),
    igstTotal: z.number(),
    gstTotal: z.number().describe('CGST + SGST + IGST.'),
    roundOff: z.number(),
    netSales: z.number().describe('Sum of bill totals (what customers paid).'),
    averageBill: z.number().describe('Net sales ÷ bills (0 when there are no bills).'),
    cash: z.number().describe('Cash received minus change returned.'),
    upi: z.number(),
    card: z.number(),
  })
  .meta({ id: 'SalesTotals' });
export type SalesTotals = z.infer<typeof salesTotalsSchema>;

export const salesDaySchema = z
  .object({ date: z.iso.date(), ...salesTotalsSchema.shape })
  .meta({ id: 'SalesDay' });
export type SalesDay = z.infer<typeof salesDaySchema>;

export const salesReportSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    totals: salesTotalsSchema,
    days: z.array(salesDaySchema).describe('Days that had sales, oldest first.'),
  })
  .meta({ id: 'SalesReport' });
export type SalesReport = z.infer<typeof salesReportSchema>;

// ---- Stock report -------------------------------------------------------------------------------

/**
 * Which items the stock report lists (by the stock at the end of the period):
 *   any      — items that had stock or a movement in the period (default);
 *   in       — closing stock above 0;  out — 0 or less;  negative — below 0;
 *   all      — every item, also those that never had stock.
 */
export const STOCK_REPORT_FILTERS = ['any', 'in', 'out', 'negative', 'all'] as const;
export type StockReportFilter = (typeof STOCK_REPORT_FILTERS)[number];

/** Most rows one export (Excel / PDF) may hold. */
export const MAX_STOCK_EXPORT_ROWS = 10_000;

export const STOCK_REPORT_SORTS = [
  'name',
  'sku',
  'brandName',
  'opening',
  'purchased',
  'sold',
  'adjusted',
  'closing',
  'stockValue',
] as const;

export const stockReportQuerySchema = createListQuerySchema(STOCK_REPORT_SORTS, {
  ...dateRangeShape,
  brandId: uuidField('brandId').optional().describe('Only items of this brand.'),
  sizeId: uuidField('sizeId').optional().describe('Only variants of this size.'),
  colorId: uuidField('colorId').optional().describe('Only variants of this colour.'),
  stock: z
    .enum(STOCK_REPORT_FILTERS, {
      error: `Stock must be one of: ${STOCK_REPORT_FILTERS.join(', ')}.`,
    })
    .default('any')
    .describe(
      'any = items with stock or a movement in the period (default); in / out / negative = by ' +
        'the closing stock (> 0 / ≤ 0 / < 0); all = every item.',
    ),
}).superRefine(checkDateRange);
export type StockReportQuery = z.infer<typeof stockReportQuerySchema>;

/** Same filters and order, without paging (page / pageSize are ignored). */
export const stockReportExportQuerySchema = stockReportQuerySchema;

const stockMovementTotalsShape = {
  opening: z.number().describe('Stock at the start of the first day (before `from`).'),
  purchased: z.number().describe('Received with purchase entries in the period.'),
  sold: z.number().describe('Sold on bills in the period (as a positive number).'),
  adjusted: z.number().describe('Net stock adjustments in the period (+ in, − out).'),
  closing: z.number().describe('Stock at the end of the last day = opening + in − out ± adj.'),
  stockValue: z
    .number()
    .describe('Closing stock (when above zero) × purchase rate, GST exclusive, in rupees.'),
};

export const stockReportRowSchema = sellableItemSchema
  .extend({
    categoryName: z.string(),
    purchaseRate: z
      .number()
      .nullable()
      .describe("The item's purchase rate now (variant override, else product); null = not set."),
    ...stockMovementTotalsShape,
  })
  .meta({ id: 'StockReportRow' });
export type StockReportRow = z.infer<typeof stockReportRowSchema>;

export const stockReportTotalsSchema = z
  .object({
    itemCount: z.number().int().describe('Items matching the filters.'),
    ...stockMovementTotalsShape,
  })
  .meta({ id: 'StockReportTotals' });
export type StockReportTotals = z.infer<typeof stockReportTotalsSchema>;

export const stockReportSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    totals: stockReportTotalsSchema.describe('Sums over every matching item (all pages).'),
    ...pagedSchema(stockReportRowSchema).shape,
  })
  .meta({ id: 'StockReport' });
export type StockReport = z.infer<typeof stockReportSchema>;

export const stockReportExportSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    totals: stockReportTotalsSchema,
    items: z
      .array(stockReportRowSchema)
      .describe(`Every matching item, at most ${MAX_STOCK_EXPORT_ROWS}.`),
    truncated: z.boolean().describe(`True when more than ${MAX_STOCK_EXPORT_ROWS} items matched.`),
  })
  .meta({ id: 'StockReportExport' });
export type StockReportExport = z.infer<typeof stockReportExportSchema>;

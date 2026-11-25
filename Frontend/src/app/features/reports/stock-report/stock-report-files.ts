import { formatDate } from '@angular/common';
import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import { StockReportExport, StockReportRow } from '../../../core/models/report.model';
import { itemDetails } from '../../../core/models/sale.model';
import { XlsxSheet, XlsxValue } from '../../../shared/excel/xlsx-file';
import { downloadPdf, pdfImage } from '../../../shared/pdf/pdf-file';
import {
  Formats,
  LINES_LAYOUT,
  PurchasePdfContext,
  definition,
  documentHead,
  headCell,
  present,
} from '../../purchase/shared/purchase-pdf';

/*
 * The stock report as files: an Excel sheet (every column, numbers as numbers so they can be
 * summed and filtered) and an A4 PDF (the same rows as the screen, with the shop's letterhead),
 * both built in the browser from /reports/stock/export.
 */

export interface StockReportFileContext extends PurchasePdfContext {
  /** Filters in use, as label / value pairs (e.g. ['Brand', 'Kalaa']). */
  readonly filters: readonly (readonly [string, string])[];
  readonly printedAt: Date;
}

const MUTED = '#6b7280';
const DANGER = '#b91c1c';
const HEAD_FILL = '#e6f2ef';

const VALUE_NOTE =
  'Stock value = closing stock above zero × the purchase rate (GST exclusive). Stock below ' +
  'zero means goods were sold before they were entered.';

/** "01 Nov 2026 – 25 Nov 2026" (one date when both ends are the same day). */
export function periodLabel(report: { from: string; to: string }, locale: string): string {
  const format = (date: string) => formatDate(date, 'dd MMM y', locale);
  return report.from === report.to
    ? format(report.from)
    : `${format(report.from)} – ${format(report.to)}`;
}

export function stockReportFileName(report: { from: string; to: string }, ext: string): string {
  return `stock-report_${report.from}_to_${report.to}.${ext}`;
}

/** "+3", "−2", "0" with the given number format. */
function signed(value: number, format: (value: number) => string): string {
  if (value > 0) return `+${format(value)}`;
  if (value < 0) return `−${format(-value)}`;
  return format(0);
}

/** Sums of quantities are rounded to 3 decimals (fabric in metres) against float noise. */
const qty = (value: number) => Math.round(value * 1000) / 1000;

// ---- Excel ----------------------------------------------------------------------------------------

const SHEET_COLUMNS: readonly {
  readonly label: string;
  readonly width: number;
  readonly numeric?: 'qty' | 'money';
  readonly value: (row: StockReportRow, index: number) => string | number | null;
}[] = [
  { label: 'S.No', width: 6, value: (_, index) => index + 1 },
  { label: 'Item', width: 32, value: (row) => row.productName },
  { label: 'Design No', width: 11, value: (row) => row.designNo },
  { label: 'Size', width: 9, value: (row) => row.sizeName },
  { label: 'Colour', width: 11, value: (row) => row.colorName },
  { label: 'Brand', width: 16, value: (row) => row.brandName },
  { label: 'Category', width: 16, value: (row) => row.categoryName },
  { label: 'SKU', width: 22, value: (row) => row.sku },
  { label: 'Barcode', width: 15, value: (row) => row.barcode },
  { label: 'Opening', width: 10, numeric: 'qty', value: (row) => row.opening },
  { label: 'Purchase (in)', width: 11, numeric: 'qty', value: (row) => row.purchased },
  { label: 'Sales (out)', width: 11, numeric: 'qty', value: (row) => row.sold },
  { label: 'Adjustment', width: 11, numeric: 'qty', value: (row) => row.adjusted },
  { label: 'Closing', width: 10, numeric: 'qty', value: (row) => row.closing },
  { label: 'Purchase rate (₹)', width: 13, numeric: 'money', value: (row) => row.purchaseRate },
  { label: 'Stock value (₹)', width: 14, numeric: 'money', value: (row) => row.stockValue },
  { label: 'Status', width: 9, value: (row) => (row.status === 'active' ? 'Active' : 'Inactive') },
];

export function stockReportSheet(
  report: StockReportExport,
  context: StockReportFileContext,
): XlsxSheet {
  const { totals } = report;
  const muted = (value: string): XlsxValue => ({ value, style: 'muted' });
  const top: XlsxValue[][] = [
    [{ value: 'Stock Report', style: 'title' }],
    ...(context.shop?.shopName ? [[{ value: context.shop.shopName, style: 'bold' as const }]] : []),
    [muted(`Period: ${periodLabel(report, context.locale)}`)],
    ...(context.filters.length
      ? [[muted(context.filters.map(([label, value]) => `${label}: ${value}`).join('  ·  '))]]
      : []),
    [
      muted(
        `${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'}  ·  Printed ` +
          formatDate(context.printedAt, 'dd MMM y, hh:mm a', context.locale),
      ),
    ],
    [],
  ];
  const headRow = top.length;
  const head: XlsxValue[] = SHEET_COLUMNS.map((column) => ({
    value: column.label,
    style: column.numeric ? 'headEnd' : 'head',
  }));
  const rows: XlsxValue[][] = report.items.map((row, index) =>
    SHEET_COLUMNS.map((column) => {
      const value = column.value(row, index);
      return column.numeric ? { value, style: column.numeric } : value;
    }),
  );
  const totalValues: Record<string, number> = {
    Opening: qty(totals.opening),
    'Purchase (in)': qty(totals.purchased),
    'Sales (out)': qty(totals.sold),
    Adjustment: qty(totals.adjusted),
    Closing: qty(totals.closing),
    'Stock value (₹)': totals.stockValue,
  };
  const totalRow: XlsxValue[] = SHEET_COLUMNS.map((column, index) => {
    if (index === 1) return { value: 'Total', style: 'totalText' };
    const value = totalValues[column.label];
    if (value === undefined) return { value: null, style: 'totalText' };
    return { value, style: column.numeric === 'money' ? 'totalMoney' : 'totalQty' };
  });
  const notes: XlsxValue[][] = [
    [],
    [muted(VALUE_NOTE)],
    ...(report.truncated
      ? [
          [
            muted(
              `Only the first ${report.items.length} of ${totals.itemCount} items are listed — ` +
                'narrow the filters to see the rest. The total row covers every item.',
            ),
          ],
        ]
      : []),
  ];
  return {
    name: 'Stock',
    widths: SHEET_COLUMNS.map((column) => column.width),
    rows: [...top, head, ...rows, totalRow, ...notes],
    headRow,
    filterRows: rows.length,
  };
}

// ---- PDF ------------------------------------------------------------------------------------------

/** Lines as on the purchase documents; the totals row (last) is shaded like the heading. */
const STOCK_LAYOUT: CustomTableLayout = {
  ...LINES_LAYOUT,
  fillColor: (row, node) => (row === 0 || row === node.table.body.length - 1 ? HEAD_FILL : null),
};

function itemCell(row: StockReportRow): TableCell {
  const details = [itemDetails(row), row.brandName].filter(Boolean).join(' · ');
  return {
    stack: [
      { text: row.productName, bold: true },
      details ? { text: details, fontSize: 7 } : null,
      { text: row.sku, fontSize: 6.5, color: MUTED },
    ].filter(present) as Content[],
  };
}

export function stockReportPdf(
  report: StockReportExport,
  context: StockReportFileContext,
): TDocumentDefinitions {
  const f = new Formats(context.locale);
  const period = periodLabel(report, context.locale);
  const { totals } = report;
  const meta: [string, string][] = [
    ['Period', period],
    ...context.filters.map(([label, value]): [string, string] => [label, value]),
    ['Items', String(totals.itemCount)],
    ['Printed', formatDate(context.printedAt, 'dd MMM y, hh:mm a', context.locale)],
  ];

  const right = (text: string, extra: Partial<Record<'bold' | 'color', unknown>> = {}) =>
    ({ text, alignment: 'right', ...extra }) as TableCell;
  const quiet = (value: number, text: string) => right(text, value === 0 ? { color: MUTED } : {});

  const head: TableCell[] = [
    headCell('#'),
    headCell('Item'),
    headCell('Opening', 'right'),
    headCell('In', 'right'),
    headCell('Out', 'right'),
    headCell('Adj.', 'right'),
    headCell('Closing', 'right'),
    headCell('Rate', 'right'),
    headCell('Value', 'right'),
  ];
  const rows: TableCell[][] = report.items.map((row, index) => [
    { text: String(index + 1), color: MUTED },
    itemCell(row),
    quiet(row.opening, f.quantity(row.opening)),
    quiet(row.purchased, f.quantity(row.purchased)),
    quiet(row.sold, f.quantity(row.sold)),
    quiet(
      row.adjusted,
      signed(row.adjusted, (v) => f.quantity(v)),
    ),
    right(f.quantity(row.closing), {
      bold: true,
      ...(row.closing < 0 ? { color: DANGER } : row.closing === 0 ? { color: MUTED } : {}),
    }),
    right(row.purchaseRate === null ? '—' : f.money(row.purchaseRate), { color: MUTED }),
    quiet(row.stockValue, f.money(row.stockValue)),
  ]);
  const totalRow: TableCell[] = [
    { text: '' },
    {
      text: `Total · ${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'}`,
      bold: true,
    },
    right(f.quantity(qty(totals.opening)), { bold: true }),
    right(f.quantity(qty(totals.purchased)), { bold: true }),
    right(f.quantity(qty(totals.sold)), { bold: true }),
    right(
      signed(qty(totals.adjusted), (v) => f.quantity(v)),
      { bold: true },
    ),
    right(f.quantity(qty(totals.closing)), { bold: true }),
    { text: '' },
    right(`₹${f.money(totals.stockValue)}`, { bold: true }),
  ];

  const content: Content[] = [
    ...documentHead(context, 'STOCK REPORT', meta),
    report.items.length
      ? {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: [16, '*', 40, 36, 36, 36, 42, 44, 58],
            body: [head, ...rows, totalRow],
          },
          layout: STOCK_LAYOUT,
          fontSize: 8,
        }
      : { text: 'No items match this period and these filters.', style: 'muted' },
    {
      stack: [
        report.truncated
          ? {
              text:
                `Only the first ${report.items.length} of ${totals.itemCount} items are listed — ` +
                'narrow the filters to see the rest. The total row covers every item.',
              color: DANGER,
              margin: [0, 0, 0, 3],
            }
          : null,
        {
          text:
            'Quantities in pieces / metres. In = purchase entries, Out = bills, Adj. = stock ' +
            `adjustments. ${VALUE_NOTE}`,
        },
      ].filter(present) as Content[],
      style: 'muted',
      fontSize: 7.5,
      margin: [0, 8, 0, 0],
    },
  ];
  return definition(period, 'Stock report', content, context, false);
}

/** Saves the report as "stock-report_2026-11-01_to_2026-11-25.pdf". */
export async function downloadStockReportPdf(
  report: StockReportExport,
  context: Omit<StockReportFileContext, 'logo'> & { logo: string },
): Promise<void> {
  const logo = await pdfImage(context.logo);
  await downloadPdf(
    stockReportPdf(report, { ...context, logo }),
    stockReportFileName(report, 'pdf'),
  );
}

import { formatDate, formatNumber } from '@angular/common';
import type {
  Content,
  ContentTable,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import { PE_STATUS_LABELS, PurchaseEntry } from '../../../core/models/purchase-entry.model';
import { PO_STATUS_LABELS, PurchaseOrder } from '../../../core/models/purchase-order.model';
import { itemDetails } from '../../../core/models/sale.model';
import { ShopProfile } from '../../../core/models/shop-profile.model';
import { downloadPdf, pdfImage } from '../../../shared/pdf/pdf-file';

/*
 * Purchase orders and purchase entries as PDF files — the same A4 document as the print view
 * (shop and supplier, lines, GST breakup, notes, signature line), built in the browser with
 * pdfmake: real text, the table heading repeated on every page, page numbers in the footer.
 * The building blocks are exported for other A4 documents (e.g. stock adjustments).
 */

export interface PurchasePdfContext {
  /** null when the shop profile could not be loaded. */
  readonly shop: ShopProfile | null;
  /** Shop logo as a PNG / JPEG data URL (see pdfImage()), or null. */
  readonly logo: string | null;
  /** Number / date locale, as on screen (LOCALE_ID). */
  readonly locale: string;
}

const PAGE_MARGIN = 36;
/** A4 width (595.28 pt) minus the side margins. */
const CONTENT_WIDTH = 595.28 - 2 * PAGE_MARGIN;
const TEXT = '#1f2937';
const MUTED = '#6b7280';
const RULE = '#d1d5db';
const HEAD_FILL = '#e6f2ef';
const HEAD_TEXT = '#0f4c45';

export class Formats {
  constructor(private readonly locale: string) {}

  money(value: number): string {
    return formatNumber(value, this.locale, '1.2-2');
  }

  quantity(value: number): string {
    return formatNumber(value, this.locale, '1.0-3');
  }

  date(value: string): string {
    return formatDate(value, 'dd MMM y', this.locale);
  }
}

/** "12 Main Road, Coimbatore - 641001, Tamil Nadu" */
export function shopAddress(shop: ShopProfile | null): string {
  if (!shop) return '';
  const cityLine = [shop.city, shop.pincode].filter(Boolean).join(' - ');
  return [shop.address, cityLine, shop.state].filter(Boolean).join(', ');
}

export const present = <T>(value: T | null | undefined | false | ''): value is T => !!value;

// ---- Building blocks ---------------------------------------------------------------------------

export function documentHead(
  context: PurchasePdfContext,
  title: string,
  meta: readonly (readonly [string, string])[],
): Content[] {
  const { shop, logo } = context;
  const contact = [
    shop?.phone && `Phone ${shop.phone}`,
    shop?.gstNumber && `GSTIN ${shop.gstNumber}`,
  ]
    .filter(present)
    .join('  ·  ');
  return [
    {
      columns: [
        {
          width: '*',
          stack: [
            logo ? { image: logo, fit: [160, 48], margin: [0, 0, 0, 6] } : null,
            { text: shop?.shopName || 'Your shop', style: 'shopName' },
            shopAddress(shop) ? { text: shopAddress(shop), style: 'muted' } : null,
            contact ? { text: contact, style: 'muted' } : null,
          ].filter(present) as Content[],
        },
        {
          width: 'auto',
          stack: [
            { text: title, style: 'docTitle' },
            {
              table: {
                body: meta.map(([label, value]) => [
                  { text: label, color: MUTED },
                  { text: value, bold: label.endsWith('No') },
                ]),
              },
              layout: 'noBorders',
            },
          ],
        },
      ],
      columnGap: 24,
    },
    rule(1.5, TEXT, [0, 10, 0, 10]),
  ];
}

function rule(width: number, color: string, margin: [number, number, number, number]): Content {
  return {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: width, lineColor: color },
    ],
    margin,
  };
}

function party(
  heading: string,
  lines: readonly (string | false | null | undefined)[],
  name: string,
): Content {
  return {
    stack: [
      { text: heading.toUpperCase(), style: 'label' },
      { text: name, bold: true },
      ...lines.filter(present).map((line) => ({ text: line })),
    ],
  };
}

export const LINES_LAYOUT: CustomTableLayout = {
  fillColor: (row) => (row === 0 ? HEAD_FILL : null),
  hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0.8 : 0.4),
  hLineColor: () => RULE,
  vLineWidth: () => 0,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

export function headCell(text: string, alignment: 'left' | 'right' = 'left'): TableCell {
  return { text: text.toUpperCase(), style: 'tableHead', alignment };
}

/** Name, design · size · colour, and the SKU (with the HSN when it has no column of its own). */
export function itemCell(
  item: {
    productName: string;
    sku: string;
    hsnCode: string;
    designNo: string;
    sizeName: string;
    colorName: string;
  },
  withHsn = false,
): TableCell {
  const details = itemDetails(item);
  const codes = withHsn && item.hsnCode ? `${item.sku}  ·  HSN ${item.hsnCode}` : item.sku;
  return {
    stack: [
      { text: item.productName, bold: true },
      details ? { text: details, fontSize: 7.5 } : null,
      { text: codes, fontSize: 6.5, color: MUTED },
    ].filter(present) as Content[],
  };
}

/** Amount with a small second line, e.g. GST "216.00 / 5%". */
export function twoLine(
  main: string,
  sub: string | null,
  alignment: 'left' | 'right' = 'right',
): TableCell {
  return {
    stack: [{ text: main }, sub ? { text: sub, fontSize: 6.5, color: MUTED } : null].filter(
      present,
    ) as Content[],
    alignment,
  };
}

interface Totals {
  grossAmount: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  supplyType: 'intra' | 'inter';
}

function totalsTable(
  totals: Totals,
  f: Formats,
  extra: readonly (readonly [string, string])[] = [],
): ContentTable {
  const rows: [string, string][] = [['Gross', f.money(totals.grossAmount)]];
  if (totals.discountTotal) rows.push(['Discount', `−${f.money(totals.discountTotal)}`]);
  rows.push(['Taxable value', f.money(totals.taxableTotal)]);
  if (totals.supplyType === 'inter') {
    rows.push(['IGST', f.money(totals.igstTotal)]);
  } else {
    rows.push(['CGST', f.money(totals.cgstTotal)], ['SGST', f.money(totals.sgstTotal)]);
  }
  if (totals.roundOff) rows.push(['Round-off', f.money(totals.roundOff)]);
  const grandRow = rows.length;
  const body: TableCell[][] = [
    ...rows.map(([label, value]) => [
      { text: label, color: MUTED },
      { text: value, alignment: 'right' as const },
    ]),
    [
      { text: 'Total', bold: true, fontSize: 12, margin: [0, 3, 0, 0] },
      {
        text: `₹${f.money(totals.grandTotal)}`,
        bold: true,
        fontSize: 12,
        alignment: 'right',
        margin: [0, 3, 0, 0],
      },
    ],
    ...extra.map(([label, value]) => [
      { text: label, color: MUTED, fontSize: 8 },
      { text: value, alignment: 'right' as const, fontSize: 8 },
    ]),
  ];
  return {
    table: { widths: ['*', 'auto'], body },
    layout: {
      hLineWidth: (index) => (index === grandRow ? 1.2 : 0),
      hLineColor: () => TEXT,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
  };
}

export function signOff(left: string, signature: string): Content {
  return {
    columns: [
      { width: '*', text: left, style: 'muted', margin: [0, 26, 0, 0] },
      {
        width: 170,
        stack: [
          {
            canvas: [
              { type: 'line', x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 0.8, lineColor: TEXT },
            ],
          },
          { text: signature, alignment: 'center', margin: [0, 4, 0, 0] },
        ],
        margin: [0, 34, 0, 0],
      },
    ],
    unbreakable: true,
  };
}

export function definition(
  docNo: string,
  title: string,
  content: Content[],
  context: PurchasePdfContext,
  cancelled: boolean,
): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, 44],
    info: { title: `${title} ${docNo}`, author: context.shop?.shopName || undefined },
    watermark: cancelled
      ? { text: 'CANCELLED', color: '#dc2626', opacity: 0.12, bold: true }
      : undefined,
    footer: (page, pages) => ({
      columns: [
        { text: `${title} ${docNo}`, color: MUTED },
        { text: `Page ${page} of ${pages}`, alignment: 'right', color: MUTED },
      ],
      fontSize: 7.5,
      margin: [PAGE_MARGIN, 14, PAGE_MARGIN, 0],
    }),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: TEXT, lineHeight: 1.15 },
    styles: {
      shopName: { fontSize: 15, bold: true, margin: [0, 0, 0, 3] },
      docTitle: { fontSize: 13, bold: true, characterSpacing: 1.5, margin: [0, 0, 0, 6] },
      muted: { color: MUTED },
      label: {
        fontSize: 7.5,
        bold: true,
        color: MUTED,
        characterSpacing: 0.5,
        margin: [0, 0, 0, 3],
      },
      tableHead: { fontSize: 7, bold: true, color: HEAD_TEXT },
    },
  };
}

// ---- Purchase order ------------------------------------------------------------------------------

export function purchaseOrderPdf(
  po: PurchaseOrder,
  context: PurchasePdfContext,
): TDocumentDefinitions {
  const f = new Formats(context.locale);
  const showReceived = po.items.some((item) => item.receivedQuantity > 0);
  const meta: [string, string][] = [
    ['PO No', po.poNo],
    ['PO date', f.date(po.poDate)],
  ];
  if (po.expectedDate) meta.push(['Expected by', f.date(po.expectedDate)]);
  meta.push(['Status', PO_STATUS_LABELS[po.status]]);

  const head: TableCell[] = [
    headCell('#'),
    headCell('Item'),
    headCell('HSN'),
    headCell('Qty', 'right'),
    headCell('Rate', 'right'),
    headCell('Disc %', 'right'),
    headCell('Taxable', 'right'),
    headCell('GST', 'right'),
    headCell('Amount', 'right'),
  ];
  if (showReceived) head.push(headCell('Received', 'right'));
  const rows: TableCell[][] = po.items.map((item) => {
    const tax = item.cgstAmount + item.sgstAmount + item.igstAmount;
    const row: TableCell[] = [
      { text: String(item.lineNo), color: MUTED },
      itemCell(item),
      { text: item.hsnCode || '—', fontSize: 7.5 },
      { text: f.quantity(item.quantity), alignment: 'right' },
      { text: f.money(item.rate), alignment: 'right' },
      { text: item.discountPercent ? String(item.discountPercent) : '—', alignment: 'right' },
      { text: f.money(item.taxableValue), alignment: 'right' },
      twoLine(f.money(tax), `${item.gstRate}%`),
      { text: f.money(item.lineTotal), alignment: 'right', bold: true },
    ];
    if (showReceived) {
      const pending = Math.max(
        0,
        Math.round((item.quantity - item.receivedQuantity) * 1000) / 1000,
      );
      row.push(
        twoLine(
          f.quantity(item.receivedQuantity),
          pending ? `${f.quantity(pending)} to come` : 'Complete',
        ),
      );
    }
    return row;
  });
  const widths: (number | string)[] = [12, '*', 30, 30, 44, 26, 50, 42, 52];
  if (showReceived) widths.push(44);

  const content: Content[] = [
    ...documentHead(context, 'PURCHASE ORDER', meta),
    {
      columns: [
        party(
          'Supplier',
          [
            po.supplierAddress,
            po.supplierState,
            `Mobile ${po.supplierMobile}${po.supplierGstNumber ? `  ·  GSTIN ${po.supplierGstNumber}` : ''}`,
          ],
          po.supplierName,
        ),
        party(
          'Deliver to',
          [
            shopAddress(context.shop),
            po.supplyType === 'inter'
              ? 'Inter-state supply — IGST'
              : 'Intra-state supply — CGST + SGST',
          ],
          context.shop?.shopName || 'Your shop',
        ),
      ],
      columnGap: 24,
      margin: [0, 0, 0, 12],
    },
    {
      table: { headerRows: 1, dontBreakRows: true, widths, body: [head, ...rows] },
      layout: LINES_LAYOUT,
      fontSize: 8,
    },
    // Notes, totals and the signature line stay together (never a signature alone on a page).
    {
      stack: [
        {
          columns: [
            {
              width: '*',
              stack: [
                po.notes ? { text: 'NOTES / TERMS', style: 'label', margin: [0, 0, 0, 3] } : null,
                po.notes ? { text: po.notes, margin: [0, 0, 0, 6] } : null,
                {
                  text:
                    `${po.itemCount} ${po.itemCount === 1 ? 'item' : 'items'} · ` +
                    `${f.quantity(po.totalQuantity)} total quantity · Rates exclude GST`,
                  style: 'muted',
                  fontSize: 8,
                },
              ].filter(present) as Content[],
            },
            { width: 210, ...totalsTable(po, f) },
          ],
          columnGap: 24,
          margin: [0, 12, 0, 0],
        },
        signOff(
          `Prepared by ${po.createdByName} on ${f.date(po.createdAt)}`,
          'Authorised signatory',
        ),
      ],
      unbreakable: true,
    },
  ];
  return definition(po.poNo, 'Purchase order', content, context, po.status === 'cancelled');
}

// ---- Purchase entry ------------------------------------------------------------------------------

export function purchaseEntryPdf(
  entry: PurchaseEntry,
  context: PurchasePdfContext,
): TDocumentDefinitions {
  const f = new Formats(context.locale);
  const meta: [string, string][] = [
    ['PE No', entry.peNo],
    ['Received on', f.date(entry.entryDate)],
    ['Supplier invoice', `${entry.supplierInvoiceNo} · ${f.date(entry.supplierInvoiceDate)}`],
    ['Against PO', entry.poNo ?? 'Direct purchase'],
    ['Status', PE_STATUS_LABELS[entry.status]],
  ];

  const head: TableCell[] = [
    headCell('#'),
    headCell('Item'),
    headCell('Qty', 'right'),
    headCell('Rate', 'right'),
    headCell('Disc %', 'right'),
    headCell('Taxable', 'right'),
    headCell('GST', 'right'),
    headCell('Amount', 'right'),
    headCell('MRP', 'right'),
    headCell('Sell', 'right'),
  ];
  const rows: TableCell[][] = entry.items.map((item) => {
    const tax = item.cgstAmount + item.sgstAmount + item.igstAmount;
    const ordered =
      item.orderedQuantity !== null
        ? `PO ${f.quantity(item.orderedQuantity)}`
        : entry.purchaseOrderId
          ? 'Not on PO'
          : null;
    return [
      { text: String(item.lineNo), color: MUTED },
      itemCell(item, true),
      twoLine(f.quantity(item.quantity), ordered),
      { text: f.money(item.rate), alignment: 'right' },
      { text: item.discountPercent ? String(item.discountPercent) : '—', alignment: 'right' },
      { text: f.money(item.taxableValue), alignment: 'right' },
      twoLine(f.money(tax), `${item.gstRate}%`),
      { text: f.money(item.lineTotal), alignment: 'right', bold: true },
      { text: f.money(item.mrp), alignment: 'right' },
      { text: f.money(item.sellingPrice), alignment: 'right' },
    ];
  });

  const extra: [string, string][] = [];
  if (entry.billAmount !== null) {
    const difference = Math.round((entry.billAmount - entry.grandTotal) * 100) / 100;
    extra.push([
      'Supplier bill',
      `₹${f.money(entry.billAmount)}` +
        (difference
          ? ` (${difference > 0 ? '+' : '−'}${f.money(Math.abs(difference))})`
          : ' — matches'),
    ]);
  }

  const content: Content[] = [
    ...documentHead(context, 'PURCHASE ENTRY', meta),
    {
      columns: [
        party(
          'Supplier',
          [
            entry.supplierAddress,
            entry.supplierState,
            `Mobile ${entry.supplierMobile}${entry.supplierGstNumber ? `  ·  GSTIN ${entry.supplierGstNumber}` : ''}`,
          ],
          entry.supplierName,
        ),
        party(
          'Received at',
          [
            shopAddress(context.shop),
            entry.supplyType === 'inter'
              ? 'Inter-state supply — IGST'
              : 'Intra-state supply — CGST + SGST',
          ],
          context.shop?.shopName || 'Your shop',
        ),
      ],
      columnGap: 24,
      margin: [0, 0, 0, 12],
    },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [10, '*', 34, 40, 24, 46, 40, 48, 38, 38],
        body: [head, ...rows],
      },
      layout: LINES_LAYOUT,
      fontSize: 7.5,
    },
    // Notes, totals and the signature line stay together (never a signature alone on a page).
    {
      stack: [
        {
          columns: [
            {
              width: '*',
              stack: [
                entry.notes ? { text: 'NOTES', style: 'label', margin: [0, 0, 0, 3] } : null,
                entry.notes ? { text: entry.notes, margin: [0, 0, 0, 6] } : null,
                {
                  text:
                    `${entry.itemCount} ${entry.itemCount === 1 ? 'item' : 'items'} · ` +
                    `${f.quantity(entry.totalQuantity)} total quantity · Rates exclude GST · ` +
                    'MRP and selling prices include GST',
                  style: 'muted',
                  fontSize: 8,
                },
              ].filter(present) as Content[],
            },
            { width: 210, ...totalsTable(entry, f, extra) },
          ],
          columnGap: 24,
          margin: [0, 12, 0, 0],
        },
        signOff(`Entered by ${entry.createdByName} on ${f.date(entry.createdAt)}`, 'Checked by'),
      ],
      unbreakable: true,
    },
  ];
  return definition(entry.peNo, 'Purchase entry', content, context, entry.status === 'cancelled');
}

// ---- Download ----------------------------------------------------------------------------------

/** Saves the PO as "PO-2026-00001.pdf". */
export async function downloadPurchaseOrderPdf(
  po: PurchaseOrder,
  context: Omit<PurchasePdfContext, 'logo'> & { logo: string },
): Promise<void> {
  const logo = await pdfImage(context.logo);
  await downloadPdf(purchaseOrderPdf(po, { ...context, logo }), `${po.poNo}.pdf`);
}

/** Saves the entry as "PE-2026-00001.pdf". */
export async function downloadPurchaseEntryPdf(
  entry: PurchaseEntry,
  context: Omit<PurchasePdfContext, 'logo'> & { logo: string },
): Promise<void> {
  const logo = await pdfImage(context.logo);
  await downloadPdf(purchaseEntryPdf(entry, { ...context, logo }), `${entry.peNo}.pdf`);
}

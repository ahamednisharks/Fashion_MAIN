import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

import {
  ADJUSTMENT_MODE_LABELS,
  ADJUSTMENT_REASON_LABELS,
  ADJUSTMENT_STATUS_LABELS,
  StockAdjustment,
} from '../../core/models/stock-adjustment.model';
import { downloadPdf, pdfImage } from '../../shared/pdf/pdf-file';
import {
  Formats,
  LINES_LAYOUT,
  PurchasePdfContext,
  definition,
  documentHead,
  headCell,
  itemCell,
  present,
  signOff,
} from '../purchase/shared/purchase-pdf';

/*
 * A stock adjustment as a PDF file — the same A4 document as the print view: shop, reason,
 * each item with the stock before, the count, the change and its value, notes and a signature
 * line. Built in the browser with pdfmake, like the purchase documents.
 */

const SUCCESS = '#15803d';
const DANGER = '#b91c1c';
const MUTED = '#6b7280';

/** "+3", "−2", "0" with the screen's number format. */
function signed(value: number, format: (value: number) => string): string {
  if (value > 0) return `+${format(value)}`;
  if (value < 0) return `−${format(-value)}`;
  return format(0);
}

export function stockAdjustmentPdf(
  adjustment: StockAdjustment,
  context: PurchasePdfContext,
): TDocumentDefinitions {
  const f = new Formats(context.locale);
  const count = adjustment.mode === 'count';
  const meta: [string, string][] = [
    ['ADJ No', adjustment.adjNo],
    ['Date', f.date(adjustment.adjustmentDate)],
    ['Reason', ADJUSTMENT_REASON_LABELS[adjustment.reason]],
    ['Entered as', ADJUSTMENT_MODE_LABELS[adjustment.mode]],
    ['Status', ADJUSTMENT_STATUS_LABELS[adjustment.status]],
  ];

  const head: TableCell[] = [
    headCell('#'),
    headCell('Item'),
    headCell('In stock', 'right'),
    ...(count ? [headCell('Counted', 'right')] : []),
    headCell('Change', 'right'),
    headCell('After', 'right'),
    headCell('Cost', 'right'),
    headCell('Value', 'right'),
  ];
  const rows: TableCell[][] = adjustment.items.map((item) => {
    const cell = itemCell({ ...item, hsnCode: '' });
    const itemWithNote: TableCell = item.note
      ? {
          stack: [cell as Content, { text: item.note, fontSize: 6.5, italics: true, color: MUTED }],
        }
      : cell;
    const color = item.quantity > 0 ? SUCCESS : item.quantity < 0 ? DANGER : MUTED;
    return [
      { text: String(item.lineNo), color: MUTED },
      itemWithNote,
      { text: f.quantity(item.systemQuantity), alignment: 'right' },
      ...(count
        ? [{ text: f.quantity(item.countedQuantity ?? 0), alignment: 'right' } as TableCell]
        : []),
      {
        text: item.quantity === 0 ? 'Matches' : signed(item.quantity, (v) => f.quantity(v)),
        alignment: 'right',
        bold: item.quantity !== 0,
        color,
      },
      {
        text: f.quantity(Math.round((item.systemQuantity + item.quantity) * 1000) / 1000),
        alignment: 'right',
      },
      { text: item.unitCost === null ? '—' : f.money(item.unitCost), alignment: 'right' },
      {
        text: item.unitCost === null ? '—' : signed(item.value, (v) => f.money(v)),
        alignment: 'right',
      },
    ];
  });
  const widths: (number | string)[] = count
    ? [12, '*', 42, 42, 44, 42, 50, 58]
    : [12, '*', 46, 50, 46, 54, 62];

  const net = Math.round((adjustment.valueIn - adjustment.valueOut) * 100) / 100;
  const totals: TableCell[][] = [
    [
      { text: 'Into stock', color: MUTED },
      { text: signed(adjustment.quantityIn, (v) => f.quantity(v)), alignment: 'right' },
      { text: f.money(adjustment.valueIn), alignment: 'right' },
    ],
    [
      { text: 'Out of stock', color: MUTED },
      { text: signed(-adjustment.quantityOut, (v) => f.quantity(v)), alignment: 'right' },
      { text: f.money(adjustment.valueOut), alignment: 'right' },
    ],
    [
      { text: 'Net value', bold: true, fontSize: 11, margin: [0, 3, 0, 0] },
      { text: '' },
      {
        text: `${net < 0 ? '−' : ''}₹${f.money(Math.abs(net))}`,
        bold: true,
        fontSize: 11,
        alignment: 'right',
        margin: [0, 3, 0, 0],
      },
    ],
  ];

  const content: Content[] = [
    ...documentHead(context, 'STOCK ADJUSTMENT', meta),
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
                adjustment.notes ? { text: 'NOTES', style: 'label', margin: [0, 0, 0, 3] } : null,
                adjustment.notes ? { text: adjustment.notes, margin: [0, 0, 0, 6] } : null,
                {
                  text:
                    `${adjustment.itemCount} ${adjustment.itemCount === 1 ? 'item' : 'items'} · ` +
                    (count
                      ? 'Change = counted − in stock when saved · '
                      : 'Change = quantity added (+) or taken out (−) · ') +
                    'Cost per piece excludes GST',
                  style: 'muted',
                  fontSize: 8,
                },
              ].filter(present) as Content[],
            },
            {
              width: 210,
              table: { widths: ['*', 'auto', 'auto'], body: totals },
              layout: {
                hLineWidth: (index) => (index === 2 ? 1.2 : 0),
                hLineColor: () => '#1f2937',
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 4,
                paddingTop: () => 2,
                paddingBottom: () => 2,
              },
            },
          ],
          columnGap: 24,
          margin: [0, 12, 0, 0],
        },
        signOff(
          `Entered by ${adjustment.createdByName} on ${f.date(adjustment.createdAt)}` +
            (adjustment.status === 'cancelled' && adjustment.cancelledByName
              ? ` · cancelled by ${adjustment.cancelledByName}`
              : ''),
          'Checked by',
        ),
      ],
      unbreakable: true,
    },
  ];
  return definition(
    adjustment.adjNo,
    'Stock adjustment',
    content,
    context,
    adjustment.status === 'cancelled',
  );
}

/** Saves the adjustment as "ADJ-2026-00001.pdf". */
export async function downloadStockAdjustmentPdf(
  adjustment: StockAdjustment,
  context: Omit<PurchasePdfContext, 'logo'> & { logo: string },
): Promise<void> {
  const logo = await pdfImage(context.logo);
  await downloadPdf(
    stockAdjustmentPdf(adjustment, { ...context, logo }),
    `${adjustment.adjNo}.pdf`,
  );
}

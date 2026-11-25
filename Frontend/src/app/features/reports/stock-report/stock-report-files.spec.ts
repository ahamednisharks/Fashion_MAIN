import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import type { Content, ContentTable } from 'pdfmake/interfaces';

import { StockReportExport, StockReportRow } from '../../../core/models/report.model';
import { XlsxCell, XlsxValue } from '../../../shared/excel/xlsx-file';
import {
  periodLabel,
  stockReportFileName,
  stockReportPdf,
  stockReportSheet,
} from './stock-report-files';

registerLocaleData(localeEnIn);

function row(overrides: Partial<StockReportRow>): StockReportRow {
  return {
    productId: 'p1',
    variantId: 'v1',
    productName: "Men's Cotton Casual Shirt",
    productCode: 'MSH-1001',
    productType: 'readymade',
    brandName: 'Urban Weave',
    designNo: '101',
    sizeName: 'M',
    colorName: 'Black',
    colorHex: '#000000',
    sku: 'MSH-1001-101-BLK-M',
    barcode: '8901234510011',
    hsnCode: '6205',
    gstRate: 5,
    mrp: 1499,
    unitPrice: 1299,
    status: 'active',
    stock: 9,
    categoryName: "Men's Shirts",
    purchaseRate: 720,
    opening: 10,
    purchased: 4,
    sold: 3,
    adjusted: -1,
    closing: 10,
    stockValue: 7200,
    ...overrides,
  };
}

const report: StockReportExport = {
  from: '2026-10-01',
  to: '2026-10-31',
  totals: {
    itemCount: 2,
    opening: 10,
    purchased: 4,
    sold: 5,
    adjusted: -1,
    closing: 8,
    stockValue: 7200,
  },
  items: [
    row({}),
    row({
      productId: 'p2',
      variantId: null,
      productName: 'Silk Blend Stole',
      designNo: '',
      sizeName: '',
      colorName: '',
      brandName: 'Shop Label',
      sku: 'ACC-8001',
      purchaseRate: null,
      opening: 0,
      purchased: 0,
      sold: 2,
      adjusted: 0,
      closing: -2,
      stockValue: 0,
    }),
  ],
  truncated: false,
};

const context = {
  shop: null,
  logo: null,
  locale: 'en-IN',
  filters: [['Brand', 'Urban Weave']] as [string, string][],
  printedAt: new Date(2026, 10, 25, 10, 30),
};

const valueOf = (cell: XlsxValue | undefined) =>
  cell !== null && typeof cell === 'object' ? (cell as XlsxCell).value : cell;

describe('stock report files', () => {
  it('names the period and the file', () => {
    expect(periodLabel(report, 'en-IN')).toBe('01 Oct 2026 – 31 Oct 2026');
    expect(periodLabel({ from: '2026-10-05', to: '2026-10-05' }, 'en-IN')).toBe('05 Oct 2026');
    expect(stockReportFileName(report, 'xlsx')).toBe('stock-report_2026-10-01_to_2026-10-31.xlsx');
  });

  it('lays out the Excel sheet: heading lines, column heads, rows, totals', () => {
    const sheet = stockReportSheet(report, context);
    const text = sheet.rows.map((cells) => cells.map(valueOf));
    expect(text[0]).toEqual(['Stock Report']);
    expect(text[1]).toEqual(['Period: 01 Oct 2026 – 31 Oct 2026']);
    expect(text[2]).toEqual(['Brand: Urban Weave']);

    const head = sheet.headRow!;
    expect(text[head]?.slice(0, 2)).toEqual(['S.No', 'Item']);
    expect(text[head]).toContain('Closing');
    expect(sheet.filterRows).toBe(2);
    expect(sheet.widths).toHaveLength(text[head]!.length);

    const closing = text[head]!.indexOf('Closing');
    const rate = text[head]!.indexOf('Purchase rate (₹)');
    expect(text[head + 1]?.slice(0, 4)).toEqual([1, "Men's Cotton Casual Shirt", '101', 'M']);
    expect(text[head + 2]?.[closing]).toBe(-2);
    expect(text[head + 2]?.[rate]).toBeNull();

    const total = text[head + 3]!;
    expect(total[1]).toBe('Total');
    expect(total[closing]).toBe(8);
    expect(total[rate]).toBeNull();
    expect(text.flat().some((value) => String(value).startsWith('Only the first'))).toBe(false);
  });

  it('notes in the Excel sheet when the list was cut short', () => {
    const sheet = stockReportSheet(
      { ...report, truncated: true, totals: { ...report.totals, itemCount: 12000 } },
      context,
    );
    const notes = sheet.rows.flat().map(valueOf).map(String);
    expect(notes.some((note) => note.startsWith('Only the first 2 of 12000 items'))).toBe(true);
  });

  it('builds the PDF table with a totals row', () => {
    const pdf = stockReportPdf(report, context);
    const content = pdf.content as Content[];
    const table = content.find((part) => !!(part as ContentTable).table) as ContentTable;
    const body = table.table.body;
    expect(body).toHaveLength(1 + 2 + 1); // heading, two items, totals
    expect(table.table.headerRows).toBe(1);

    const stole = body[2]!;
    expect(stole[6]).toMatchObject({ text: '-2', color: '#b91c1c' });
    expect(stole[7]).toMatchObject({ text: '—' });
    expect(body[1]![5]).toMatchObject({ text: '−1' });

    const totals = body[3]!;
    expect(totals[1]).toMatchObject({ text: 'Total · 2 items' });
    expect(totals[8]).toMatchObject({ text: '₹7,200.00' });
    expect(pdf.info?.title).toBe('Stock report 01 Oct 2026 – 31 Oct 2026');
  });
});

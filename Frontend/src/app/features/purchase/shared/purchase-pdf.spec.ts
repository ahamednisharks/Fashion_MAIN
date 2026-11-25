import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import type { ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces';

import { PurchaseEntry } from '../../../core/models/purchase-entry.model';
import { PurchaseOrder } from '../../../core/models/purchase-order.model';
import { ShopProfile } from '../../../core/models/shop-profile.model';
import { purchaseEntryPdf, purchaseOrderPdf } from './purchase-pdf';

registerLocaleData(localeEnIn);

const shop: ShopProfile = {
  shopName: 'Kachi Fashions',
  phone: '9876543210',
  email: '',
  gstNumber: '33ABCDE1234F1Z5',
  address: '12 Main Road',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  pincode: '641001',
};
const context = { shop, logo: null, locale: 'en-IN' };

const line = {
  lineNo: 1,
  productId: 'p1',
  variantId: 'v1',
  productName: "Men's Cotton Casual Shirt",
  productCode: 'MSH-1001',
  designNo: '101',
  sizeName: 'M',
  colorName: 'Black',
  sku: 'MSH-1001-101-BLK-M',
  barcode: '',
  hsnCode: '6205',
  productType: 'readymade' as const,
  gstRate: 5,
  quantity: 150,
  rate: 720,
  discountPercent: 0,
  grossAmount: 108000,
  discountAmount: 0,
  taxableValue: 108000,
  cgstAmount: 2700,
  sgstAmount: 2700,
  igstAmount: 0,
  lineTotal: 113400,
};

const totals = {
  itemCount: 1,
  totalQuantity: 150,
  grossAmount: 108000,
  discountTotal: 0,
  taxableTotal: 108000,
  cgstTotal: 2700,
  sgstTotal: 2700,
  igstTotal: 0,
  roundOff: 0,
  grandTotal: 113400,
  supplyType: 'intra' as const,
};

const supplier = {
  supplierId: 's1',
  supplierName: 'Tiruppur Knit Exports',
  supplierMobile: '9443022110',
  supplierGstNumber: '33ABCPT7712M1ZD',
  supplierAddress: 'Avinashi Road, Tiruppur - 641603',
  supplierState: 'Tamil Nadu',
};

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po1',
    poNo: 'PO-2026-00001',
    poDate: '2026-11-24',
    expectedDate: null,
    ...supplier,
    ...totals,
    status: 'open',
    notes: 'Deliver by courier',
    cancelledAt: null,
    createdBy: 'u1',
    createdByName: 'Shop Admin',
    updatedByName: 'Shop Admin',
    createdAt: '2026-11-24T10:00:00Z',
    updatedAt: '2026-11-24T10:00:00Z',
    items: [{ ...line, receivedQuantity: 0 }],
    ...overrides,
  };
}

function entry(overrides: Partial<PurchaseEntry> = {}): PurchaseEntry {
  return {
    id: 'e1',
    peNo: 'PE-2026-00001',
    entryDate: '2026-11-24',
    supplierInvoiceNo: 'TKE/1042',
    supplierInvoiceDate: '2026-11-23',
    purchaseOrderId: 'po1',
    poNo: 'PO-2026-00001',
    ...supplier,
    ...totals,
    status: 'posted',
    notes: '',
    billAmount: 113402,
    cancelledAt: null,
    createdBy: 'u1',
    createdByName: 'Shop Admin',
    updatedByName: 'Shop Admin',
    createdAt: '2026-11-24T10:00:00Z',
    updatedAt: '2026-11-24T10:00:00Z',
    items: [{ ...line, mrp: 1599, sellingPrice: 1399, orderedQuantity: 160 }],
    ...overrides,
  };
}

const text = (doc: TDocumentDefinitions) => JSON.stringify(doc.content);

/** The lines table (the only table with a repeated heading row). */
function linesTable(doc: TDocumentDefinitions): ContentTable['table'] {
  const found = (doc.content as unknown[]).find(
    (block) => (block as ContentTable).table?.headerRows === 1,
  ) as ContentTable;
  return found.table;
}

const headings = (doc: TDocumentDefinitions) =>
  (linesTable(doc).body[0] as { text: string }[]).map((cell) => cell.text);

describe('purchase PDFs', () => {
  it('lays out a purchase order like the print', () => {
    const doc = purchaseOrderPdf(po(), context);
    const all = text(doc);
    expect(doc.pageSize).toBe('A4');
    expect(doc.info?.title).toBe('Purchase order PO-2026-00001');
    expect(all).toContain('PURCHASE ORDER');
    expect(all).toContain('Kachi Fashions');
    expect(all).toContain('GSTIN 33ABCDE1234F1Z5');
    expect(all).toContain('Tiruppur Knit Exports');
    expect(all).toContain('Deliver by courier');
    // Indian digit grouping, as on screen.
    expect(all).toContain('1,08,000.00');
    expect(all).toContain('₹1,13,400.00');
    expect(all).toContain('Authorised signatory');
    expect(headings(doc)).toEqual([
      '#',
      'ITEM',
      'HSN',
      'QTY',
      'RATE',
      'DISC %',
      'TAXABLE',
      'GST',
      'AMOUNT',
    ]);
    expect(linesTable(doc).widths?.length).toBe(9);
    expect(doc.watermark).toBeUndefined();
  });

  it('adds the received column and marks cancelled orders', () => {
    const received = purchaseOrderPdf(
      po({ status: 'partial', items: [{ ...line, receivedQuantity: 100 }] }),
      context,
    );
    expect(headings(received).at(-1)).toBe('RECEIVED');
    expect(text(received)).toContain('50 to come');

    const cancelled = purchaseOrderPdf(po({ status: 'cancelled' }), context);
    expect(cancelled.watermark).toEqual(expect.objectContaining({ text: 'CANCELLED' }));
  });

  it('lays out a purchase entry with prices, PO quantities and the bill check', () => {
    const doc = purchaseEntryPdf(entry(), context);
    const all = text(doc);
    expect(doc.info?.title).toBe('Purchase entry PE-2026-00001');
    expect(all).toContain('PURCHASE ENTRY');
    expect(all).toContain('TKE/1042 · 23 Nov 2026');
    expect(all).toContain('PO 160');
    expect(all).toContain('HSN 6205');
    expect(all).toContain('1,599.00');
    expect(all).toContain('₹1,13,402.00 (+2.00)');
    expect(all).toContain('Checked by');
    expect(headings(doc)).toEqual([
      '#',
      'ITEM',
      'QTY',
      'RATE',
      'DISC %',
      'TAXABLE',
      'GST',
      'AMOUNT',
      'MRP',
      'SELL',
    ]);

    const direct = text(
      purchaseEntryPdf(
        entry({
          purchaseOrderId: null,
          poNo: null,
          billAmount: 113400,
          items: [{ ...line, mrp: 1599, sellingPrice: 1399, orderedQuantity: null }],
        }),
        context,
      ),
    );
    expect(direct).toContain('Direct purchase');
    expect(direct).not.toContain('Not on PO');
    expect(direct).toContain('— matches');
  });
});

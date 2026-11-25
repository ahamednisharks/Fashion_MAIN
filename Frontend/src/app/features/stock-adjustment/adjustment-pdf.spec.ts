import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import type { ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces';

import { ShopProfile } from '../../core/models/shop-profile.model';
import { StockAdjustment } from '../../core/models/stock-adjustment.model';
import { stockAdjustmentPdf } from './adjustment-pdf';

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

function adjustment(overrides: Partial<StockAdjustment> = {}): StockAdjustment {
  return {
    id: 'a1',
    adjNo: 'ADJ-2026-00001',
    adjustmentDate: '2026-11-24',
    mode: 'count',
    reason: 'opening_stock',
    notes: 'Counted after closing',
    itemCount: 2,
    quantityIn: 1200,
    quantityOut: 0,
    valueIn: 864000,
    valueOut: 0,
    status: 'posted',
    createdByName: 'Administrator',
    createdAt: '2026-11-24T10:00:00Z',
    cancelledAt: null,
    cancelledByName: null,
    createdBy: 'u1',
    updatedAt: '2026-11-24T10:00:00Z',
    items: [
      {
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
        productType: 'readymade',
        systemQuantity: -2,
        countedQuantity: 1198,
        quantity: 1200,
        unitCost: 720,
        value: 864000,
        note: 'Shelf B',
      },
      {
        lineNo: 2,
        productId: 'p2',
        variantId: null,
        productName: 'Silk Blend Stole',
        productCode: 'ACC-8001',
        designNo: '',
        sizeName: '',
        colorName: '',
        sku: 'ACC-8001',
        barcode: '',
        productType: 'accessory',
        systemQuantity: 3,
        countedQuantity: 3,
        quantity: 0,
        unitCost: null,
        value: 0,
        note: '',
      },
    ],
    ...overrides,
  };
}

const text = (doc: TDocumentDefinitions) => JSON.stringify(doc.content);
const linesTable = (doc: TDocumentDefinitions) =>
  (doc.content as unknown[]).find(
    (block) => (block as ContentTable).table?.headerRows === 1,
  ) as ContentTable;

describe('stock adjustment PDF', () => {
  it('lists stock before, the count, the change and its value', () => {
    const doc = stockAdjustmentPdf(adjustment(), context);
    const table = linesTable(doc);
    expect(table.table.body.length).toBe(3);
    expect(table.table.widths?.length).toBe(8);
    const content = text(doc);
    expect(content).toContain('STOCK ADJUSTMENT');
    expect(content).toContain('ADJ-2026-00001');
    expect(content).toContain('Opening stock');
    // en-IN grouping, signed change, "Matches" for a count that agreed.
    expect(content).toContain('+1,200');
    expect(content).toContain('+8,64,000.00');
    expect(content).toContain('Matches');
    expect(content).toContain('Shelf B');
    expect(content).toContain('Counted after closing');
    expect(doc.watermark).toBeUndefined();
    expect(doc.info?.title).toBe('Stock adjustment ADJ-2026-00001');
  });

  it('has no Counted column in add / remove mode and marks cancelled ones', () => {
    const doc = stockAdjustmentPdf(
      adjustment({
        mode: 'change',
        reason: 'damaged',
        status: 'cancelled',
        cancelledByName: 'Owner',
        items: [{ ...adjustment().items[0], countedQuantity: null, quantity: -2, value: -1440 }],
      }),
      context,
    );
    expect(linesTable(doc).table.widths?.length).toBe(7);
    const content = text(doc);
    expect(content).not.toContain('COUNTED');
    expect(content).toContain('−2');
    expect(content).toContain('−1,440.00');
    expect(content).toContain('cancelled by Owner');
    expect(doc.watermark).toEqual(expect.objectContaining({ text: 'CANCELLED' }));
  });
});

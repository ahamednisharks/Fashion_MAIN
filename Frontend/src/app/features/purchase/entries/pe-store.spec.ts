import { TestBed } from '@angular/core/testing';

import { PurchaseEntry, ReceivableOrder } from '../../../core/models/purchase-entry.model';
import { PurchasableItem } from '../../../core/models/purchase-order.model';
import { PeStore, marginPercent } from './pe-store';

function item(overrides: Partial<PurchasableItem> = {}): PurchasableItem {
  return {
    productId: 'p1',
    variantId: 'v1',
    productName: 'Printed Cotton Kurti',
    productCode: 'KRT-3001',
    productType: 'readymade',
    brandName: '',
    designNo: 'K-21',
    sizeName: 'M',
    colorName: 'Mustard',
    colorHex: '',
    sku: 'KRT-3001-M',
    barcode: '',
    hsnCode: '6204',
    gstRate: 5,
    mrp: 999,
    unitPrice: 849,
    status: 'active',
    purchasePrice: 450,
    ...overrides,
  };
}

const supplier = {
  id: 's1',
  name: 'Tiruppur Knit Exports',
  mobile: '9876543210',
  gstNumber: '',
  state: 'Tamil Nadu',
  status: 'active' as const,
  address: '',
};

function order(
  lines: { item: PurchasableItem; ordered: number; received: number; rate?: number }[],
): ReceivableOrder {
  return {
    id: 'po1',
    poNo: 'PO-2026-00001',
    poDate: '2026-11-20',
    status: 'partial',
    supplierId: 's1',
    supplierName: supplier.name,
    supplierMobile: supplier.mobile,
    supplierGstNumber: '',
    supplierAddress: '',
    supplierState: supplier.state,
    items: lines.map((line, index) => ({
      ...line.item,
      lineNo: index + 1,
      orderedQuantity: line.ordered,
      receivedQuantity: line.received,
      rate: line.rate ?? 400,
      discountPercent: 10,
    })),
  };
}

describe('PeStore', () => {
  let store: PeStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PeStore] });
    store = TestBed.inject(PeStore);
    store.shopState.set('Tamil Nadu');
    store.reset('2026-11-24');
  });

  function fillHeader(): void {
    store.supplier.set(supplier);
    store.invoiceNo.set(' TKE/1042 ');
  }

  it('starts with the item prices and merges re-scans', () => {
    const key = store.add(item());
    store.add(item());
    const [line] = store.lines();
    expect(line.key).toBe(key);
    expect(line.quantity).toBe(2);
    expect(line.rate).toBe(450);
    expect(line.mrp).toBe(999);
    expect(line.sellingPrice).toBe(849);
    expect(line.ordered).toBeNull();
    expect(line.over).toBe(0);
  });

  it('works out the margin on the selling price before GST', () => {
    // 849 / 1.05 = 808.57; cost 450 → 44.3 %.
    expect(marginPercent({ rate: 450, discountPercent: 0, sellingPrice: 849 }, 5)).toBe(44.3);
    // Discount lowers the cost: 450 − 10 % = 405 → 49.9 %.
    expect(marginPercent({ rate: 450, discountPercent: 10, sellingPrice: 849 }, 5)).toBe(49.9);
    expect(marginPercent({ rate: 900, discountPercent: 0, sellingPrice: 849 }, 5)).toBeLessThan(0);
    expect(marginPercent({ rate: null, discountPercent: 0, sellingPrice: 849 }, 5)).toBeNull();
  });

  it('fills in what is still to come on the PO and flags over-receipt', () => {
    const shirt = item({ productId: 'p2', variantId: 'v2', productName: 'Shirt', sku: 'SH-M' });
    const done = item({ productId: 'p3', variantId: null, productName: 'Stole', sku: 'ST' });
    store.add(shirt); // already on the entry: kept as it is
    const added = store.setOrder(
      order([
        { item: item(), ordered: 10, received: 4 },
        { item: shirt, ordered: 5, received: 0 },
        { item: done, ordered: 2, received: 2 },
      ]),
    );
    expect(added).toBe(1);
    const [shirtLine, kurtiLine] = store.lines();
    expect(kurtiLine.quantity).toBe(6);
    expect(kurtiLine.rate).toBe(400);
    expect(kurtiLine.discountPercent).toBe(10);
    expect(kurtiLine.ordered).toBe(10);
    expect(kurtiLine.pending).toBe(6);
    expect(shirtLine.quantity).toBe(1);
    expect(shirtLine.pending).toBe(5);

    store.setQuantity(kurtiLine.key, 8);
    expect(store.lines()[1].over).toBe(2);
    expect(store.overLines().length).toBe(1);

    const extra = store.add(item({ productId: 'p9', variantId: null, sku: 'X' }));
    expect(store.lines().find((line) => line.key === extra)?.ordered).toBeNull();
    expect(store.offOrderLines().length).toBe(1);

    store.setOrder(null);
    expect(store.lines().length).toBe(3);
    expect(store.overLines().length).toBe(0);
    expect(store.offOrderLines().length).toBe(0);

    store.clearLines();
    expect(store.isEmpty()).toBe(true);
  });

  it("counts the entry's own quantities as still to come when editing", () => {
    const entry = {
      id: 'e1',
      peNo: 'PE-2026-00001',
      entryDate: '2026-11-24',
      supplierId: 's1',
      supplierName: supplier.name,
      supplierMobile: supplier.mobile,
      supplierGstNumber: '',
      supplierAddress: '',
      supplierState: 'Tamil Nadu',
      supplierInvoiceNo: 'TKE/1042',
      supplierInvoiceDate: '2026-11-23',
      purchaseOrderId: 'po1',
      poNo: 'PO-2026-00001',
      billAmount: 2126,
      notes: '',
      items: [
        {
          ...item(),
          lineNo: 1,
          quantity: 6,
          rate: 400,
          discountPercent: 10,
          sellingPrice: 899,
          orderedQuantity: 10,
        },
      ],
    } as unknown as PurchaseEntry;
    // The PO's received 10 includes this entry's 6.
    store.load(entry, order([{ item: item(), ordered: 10, received: 10 }]));
    const [line] = store.lines();
    expect(line.pending).toBe(6);
    expect(line.over).toBe(0);
    expect(line.sellingPrice).toBe(899);
    expect(store.hasUnsavedChanges()).toBe(false);
    expect(store.toInput().purchaseOrderId).toBe('po1');
    expect(store.toInput().billAmount).toBe(2126);
  });

  it('explains what is missing before saving', () => {
    expect(store.problem()).toBe('Choose a supplier.');
    store.supplier.set(supplier);
    expect(store.problem()).toBe("Enter the supplier's invoice number.");
    fillHeader();
    store.invoiceDate.set('2026-11-25');
    expect(store.problem()).toMatch(/cannot be after the received date/);
    store.invoiceDate.set('2026-11-24');
    expect(store.problem()).toBe('Add at least one item.');
    const key = store.add(item({ purchasePrice: null }));
    expect(store.problem()).toBe('Enter the rate of Printed Cotton Kurti.');
    store.setRate(key, 450);
    expect(store.setSellingPrice(key, 1200)).toBeNull();
    expect(store.problem()).toMatch(/Selling price cannot be more than the MRP/);
    store.setMrp(key, 1299);
    expect(store.problem()).toBeNull();
  });

  it('builds the request and checks the bill total', () => {
    fillHeader();
    const key = store.add(item());
    store.setQuantity(key, 5);
    store.setDiscount(key, 10);
    // 2,250 − 10 % = 2,025 + 5 % = 2,126.26 → 2,126.
    expect(store.totals().grandTotal).toBe(2126);
    store.billAmount.set(2126);
    expect(store.billDifference()).toBe(0);
    store.billAmount.set(2130);
    expect(store.billDifference()).toBe(4);

    expect(store.setMrp(key, -1)).toMatch(/negative/);
    expect(store.setRate(key, 0)).toMatch(/more than 0/);
    expect(store.toInput()).toEqual({
      supplierId: 's1',
      purchaseOrderId: null,
      supplierInvoiceNo: 'TKE/1042',
      supplierInvoiceDate: '2026-11-24',
      entryDate: '2026-11-24',
      billAmount: 2130,
      notes: '',
      items: [
        {
          productId: 'p1',
          variantId: 'v1',
          quantity: 5,
          rate: 450,
          discountPercent: 10,
          mrp: 999,
          sellingPrice: 849,
        },
      ],
    });
    expect(store.hasUnsavedChanges()).toBe(true);
    store.markSaved();
    expect(store.hasUnsavedChanges()).toBe(false);
  });
});

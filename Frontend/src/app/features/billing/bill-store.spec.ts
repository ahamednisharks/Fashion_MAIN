import { Customer } from '../../core/models/customer.model';
import { SellableItem } from '../../core/models/sale.model';
import { BillStore, checkQuantity, supplyTypeFor } from './bill-store';

function item(overrides: Partial<SellableItem> = {}): SellableItem {
  return {
    productId: 'p1',
    variantId: 'v1',
    productName: 'Printed Cotton Kurti',
    productCode: 'KRT-3001',
    productType: 'readymade',
    brandName: 'Kalaa',
    designNo: 'K-21',
    sizeName: 'M',
    colorName: 'Mustard',
    colorHex: '#D4A017',
    sku: 'KRT-3001-K-21-MSD-M',
    barcode: '',
    hsnCode: '6204',
    gstRate: 5,
    mrp: 999,
    unitPrice: 849,
    status: 'active',
    ...overrides,
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Meena Boutique',
    mobile: '9842233445',
    email: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    pincode: '',
    gstNumber: '',
    openingBalance: 0,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('BillStore', () => {
  let store: BillStore;

  beforeEach(() => {
    store = new BillStore();
  });

  it('adds a new line, and the same item again increases its quantity', () => {
    expect(store.add(item())).toEqual({ merged: false, added: true });
    expect(store.add(item())).toEqual({ merged: true, added: true });
    expect(store.add(item())).toEqual({ merged: true, added: true });

    expect(store.lines().length).toBe(1);
    expect(store.lines()[0].quantity).toBe(3);
    expect(store.lines()[0].bump).toBe(2);
    expect(store.lines()[0].amounts.lineTotal).toBe(2547);
    // 2547 incl. 5% GST → taxable 2425.71, GST 121.29 (CGST 60.65 + SGST 60.64).
    expect(store.lines()[0].taxAmount).toBe(121.29);
    expect(store.lastTouchedKey()).toBe('p1|v1');
  });

  it('keeps other sizes and products without variants on their own lines', () => {
    store.add(item());
    store.add(item({ variantId: 'v2', sizeName: 'L' }));
    store.add(item({ productId: 'p2', variantId: null, productName: 'Stole', unitPrice: 499 }));
    store.add(item({ productId: 'p2', variantId: null, productName: 'Stole', unitPrice: 499 }));

    expect(store.lines().map((line) => [line.key, line.quantity])).toEqual([
      ['p1|v1', 1],
      ['p1|v2', 1],
      ['p2|', 2],
    ]);
    expect(store.totals().itemCount).toBe(3);
    expect(store.totals().totalQuantity).toBe(4);
    expect(store.totals().grandTotal).toBe(849 * 2 + 499 * 2);
  });

  it('validates quantities (decimals only for fabric)', () => {
    store.add(item());
    expect(store.setQuantity('p1|v1', 1.5)).toBe('whole-number');
    expect(store.setQuantity('p1|v1', 0)).toBe('invalid');
    expect(store.setQuantity('p1|v1', 5)).toBeNull();
    expect(store.lines()[0].quantity).toBe(5);

    const fabric = item({ productId: 'p3', variantId: null, productType: 'fabric' });
    expect(checkQuantity(fabric, 2.25)).toBeNull();
    expect(checkQuantity(fabric, 2.2501)).toBe('too-many-decimals');
    expect(checkQuantity(fabric, 10000)).toBe('too-large');
  });

  it('steps quantity but never below 1, and removes lines', () => {
    store.add(item());
    store.step('p1|v1', -1);
    expect(store.lines()[0].quantity).toBe(1);
    store.step('p1|v1', 1);
    expect(store.lines()[0].quantity).toBe(2);
    store.remove('p1|v1');
    expect(store.isEmpty()).toBe(true);
  });

  it('applies line discounts (clamped to 0–100)', () => {
    store.add(item({ unitPrice: 1299 }));
    store.setDiscount('p1|v1', 10);
    expect(store.lines()[0].amounts.lineTotal).toBe(1169.1);
    expect(store.totals().grandTotal).toBe(1169);
    store.setDiscount('p1|v1', 150);
    expect(store.lines()[0].discountPercent).toBe(100);
  });

  it('defaults to exact cash and works out change', () => {
    store.add(item());
    expect(store.payments()).toEqual([{ mode: 'cash', amount: 849, reference: '' }]);
    store.cashTendered.set(1000);
    expect(store.settlement()).toEqual({ ok: true, amountReceived: 1000, changeReturned: 151 });
    store.cashTendered.set(500);
    expect(store.settlement().ok).toBe(false);
  });

  it('supports UPI with a reference and split payments', () => {
    store.add(item());
    store.paymentChoice.set('upi');
    store.paymentReference.set(' 4321 ');
    expect(store.payments()).toEqual([{ mode: 'upi', amount: 849, reference: '4321' }]);

    store.paymentChoice.set('split');
    store.setSplitAmount('card', 500);
    expect(store.splitRemaining()).toBe(349);
    expect(store.settlement().ok).toBe(false);
    store.setSplitAmount('cash', 400);
    expect(store.settlement()).toEqual({ ok: true, amountReceived: 900, changeReturned: 51 });
  });

  it('builds the API payload', () => {
    store.add(item());
    store.add(item());
    store.customer.set(customer());
    expect(store.toInput()).toEqual({
      customerId: 'c1',
      items: [
        { productId: 'p1', variantId: 'v1', quantity: 2, discountPercent: 0, unitPrice: 849 },
      ],
      payments: [{ mode: 'cash', amount: 1698, reference: '' }],
    });
  });

  it('refreshes item prices and starts a new bill', () => {
    store.add(item());
    expect(store.refreshItems([item({ unitPrice: 899 })])).toBe(1);
    expect(store.totals().grandTotal).toBe(899);
    store.customer.set(customer());
    store.clear();
    expect(store.isEmpty()).toBe(true);
    expect(store.customer()).toBeNull();
    expect(store.paymentChoice()).toBe('cash');
  });
});

describe('supply type', () => {
  it('uses IGST only for registered customers from another state', () => {
    expect(supplyTypeFor('Tamil Nadu', null)).toBe('intra');
    expect(supplyTypeFor('Tamil Nadu', customer({ state: 'Kerala' }))).toBe('intra');
    expect(supplyTypeFor('Tamil Nadu', customer({ gstNumber: '27AAPFU0939F1ZV' }))).toBe('inter');
    expect(supplyTypeFor('Tamil Nadu', customer({ gstNumber: '33AHVPR4410B1ZI' }))).toBe('intra');
    expect(supplyTypeFor('', customer({ gstNumber: '27AAPFU0939F1ZV' }))).toBe('intra');
  });
});

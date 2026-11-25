import { TestBed } from '@angular/core/testing';

import { PurchasableItem } from '../../core/models/purchase-order.model';
import { AdjustmentStore } from './adjustment-store';

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
    stock: 7,
    ...overrides,
  };
}

const stole = item({
  productId: 'p2',
  variantId: null,
  productName: 'Silk Blend Stole',
  sku: 'ACC-8001',
  purchasePrice: null,
  stock: -2,
});

describe('AdjustmentStore', () => {
  let store: AdjustmentStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AdjustmentStore] });
    store = TestBed.inject(AdjustmentStore);
    store.reset('2026-11-24');
  });

  it('counts one piece per scan and works out counted − in stock', () => {
    expect(store.mode()).toBe('count');
    const key = store.add(item());
    store.add(item());
    store.add(stole);
    const [kurti, stoleLine] = store.lines();
    expect(kurti.key).toBe(key);
    expect(kurti.counted).toBe(2);
    expect(kurti.difference).toBe(-5);
    expect(kurti.after).toBe(2);
    expect(kurti.value).toBe(-2250);
    expect(kurti.bump).toBe(1);
    // Below zero: counting 1 brings it up by 3; no purchase price → no value.
    expect(stoleLine.difference).toBe(3);
    expect(stoleLine.value).toBeNull();
    expect(store.totals()).toEqual({
      itemCount: 2,
      enteredCount: 2,
      quantityIn: 3,
      quantityOut: 5,
      valueIn: 0,
      valueOut: 2250,
      withoutCost: 1,
    });
  });

  it('loads items without a quantity and asks for every count', () => {
    store.add(item());
    expect(
      store.addMany([item(), stole, item({ productId: 'p3', variantId: null, sku: 'X' })]),
    ).toBe(2);
    expect(store.lines().map((line) => line.counted)).toEqual([1, null, null]);
    expect(store.problem()).toBe('Enter the counted quantity of 2 items.');
    const [, stoleLine, third] = store.lines();
    expect(store.setCounted(stoleLine.key, 0)).toBeNull();
    expect(store.problem()).toBe('Enter the counted quantity of Printed Cotton Kurti.');
    expect(store.setCounted(third.key, 7)).toBeNull();
    expect(store.problem()).toBeNull();
    // 0 is a count too (none left).
    expect(store.setCounted(third.key, 0)).toBeNull();
    expect(store.lines()[2].difference).toBe(-7);
  });

  it('refuses counts that do not fit the item', () => {
    const key = store.add(item())!;
    expect(store.setCounted(key, -1)).toMatch(/cannot be negative/);
    expect(store.setCounted(key, 1.5)).toMatch(/whole number/);
    expect(store.setCounted(key, 10000)).toMatch(/more than 9999/);
    expect(store.lines()[0].counted).toBe(1);
    const fabric = store.add(item({ productId: 'f', variantId: null, productType: 'fabric' }))!;
    expect(store.setCounted(fabric, 2.75)).toBeNull();
    expect(store.setCounted(fabric, 2.7505)).toMatch(/3 decimal places/);
  });

  it('takes damaged goods out one scan at a time and refuses the wrong direction', () => {
    store.setReason('damaged');
    expect(store.mode()).toBe('change');
    expect(store.scanStep()).toBe(-1);
    const key = store.add(item())!;
    store.add(item());
    expect(store.lines()[0].change).toBe(-2);
    expect(store.lines()[0].after).toBe(5);
    expect(store.problem()).toBeNull();

    expect(store.setChange(key, 0)).toMatch(/not 0/);
    expect(store.setChange(key, 3)).toBeNull();
    expect(store.lines()[0].problem).toBe('Damaged goods can only be taken out of stock.');
    expect(store.problem()).toMatch(/^Printed Cotton Kurti: Damaged goods can only be taken out/);

    store.setReason('found');
    expect(store.scanStep()).toBe(1);
    expect(store.lines()[0].problem).toBeNull();
    // The − / + buttons skip 0.
    store.step(key, -1);
    store.step(key, -1);
    store.step(key, -1);
    expect(store.lines()[0].change).toBe(-1);
    expect(store.lines()[0].problem).toBe('Found goods can only be added to stock.');
  });

  it('keeps what was entered when switching between count and add / remove', () => {
    const key = store.add(item())!; // stock 7
    store.setCounted(key, 10);
    store.add(stole); // counted 1, stock −2
    store.setMode('change');
    expect(store.lines().map((line) => line.change)).toEqual([3, 3]);
    store.setChange(key, -9); // more than in stock
    store.setMode('count');
    // 7 − 9 would be −2: not a count, so it has to be entered again.
    expect(store.lines().map((line) => line.counted)).toEqual([null, 1]);
  });

  it('needs notes for Other', () => {
    store.setReason('other');
    store.add(item());
    expect(store.problem()).toBe('Write in the notes what this adjustment is for.');
    store.notes.set('Sample given to the tailor');
    expect(store.problem()).toBeNull();
  });

  it('marks lines whose stock changed and sends the stock it shows', () => {
    const key = store.add(item())!;
    store.setCounted(key, 5);
    store.add(stole);
    expect(
      store.updateStock([
        { productId: 'p1', variantId: 'v1', stock: 6 },
        { productId: 'p2', variantId: null, stock: -2 },
      ]),
    ).toBe(1);
    const [kurti] = store.lines();
    expect(kurti.stock).toBe(6);
    expect(kurti.previousStock).toBe(7);
    expect(kurti.difference).toBe(-1);
    expect(store.changedStockLines().length).toBe(1);

    expect(store.toInput()).toEqual({
      adjustmentDate: '2026-11-24',
      mode: 'count',
      reason: 'stock_count',
      notes: '',
      items: [
        {
          productId: 'p1',
          variantId: 'v1',
          countedQuantity: 5,
          quantity: null,
          systemQuantity: 6,
          unitCost: 450,
          note: '',
        },
        {
          productId: 'p2',
          variantId: null,
          countedQuantity: 1,
          quantity: null,
          systemQuantity: -2,
          unitCost: null,
          note: '',
        },
      ],
    });
  });

  it('tracks unsaved changes from the start', () => {
    expect(store.hasUnsavedChanges()).toBe(false);
    const key = store.add(item())!;
    expect(store.hasUnsavedChanges()).toBe(true);
    store.setUnitCost(key, 500);
    store.setNote(key, ' shelf A ');
    expect(store.toInput().items[0]).toMatchObject({ unitCost: 500, note: 'shelf A' });
    store.markSaved();
    expect(store.hasUnsavedChanges()).toBe(false);
    expect(store.setUnitCost(key, -1)).toMatch(/negative/);
  });
});

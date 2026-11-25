import { PurchasableItem } from '../../../core/models/purchase-order.model';
import { PoStore, poSupplyTypeFor } from './po-store';

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
  mobile: '9443022110',
  gstNumber: '33ABCPT7712M1ZD',
  state: 'Tamil Nadu',
  status: 'active' as const,
  address: 'Tiruppur',
};

describe('PoStore', () => {
  let store: PoStore;

  beforeEach(() => {
    store = new PoStore();
    store.reset('2026-11-24');
  });

  it('adds items at their purchase rate and merges the same item (qty + 1)', () => {
    store.add(item());
    store.add(item());
    store.add(item({ variantId: 'v2', sku: 'KRT-3001-L', sizeName: 'L' }));
    expect(store.lines().map((line) => [line.item.sku, line.quantity, line.rate])).toEqual([
      ['KRT-3001-M', 2, 450],
      ['KRT-3001-L', 1, 450],
    ]);
    expect(store.totals().grandTotal).toBe(1418); // 3 × 450 = 1,350 + 5% = 1,417.50 → 1,418
  });

  it('asks for a rate when the product has no purchase price', () => {
    store.supplier.set(supplier);
    const key = store.add(item({ purchasePrice: null }));
    expect(store.problem()).toBe('Enter the rate of Printed Cotton Kurti.');
    expect(store.setRate(key, 0)).toBe('Rate must be more than 0.');
    expect(store.setRate(key, 455.555)).toBeNull();
    expect(store.lines()[0].rate).toBe(455.56);
    expect(store.problem()).toBeNull();
  });

  it('checks quantities like billing (decimals only for fabric)', () => {
    const key = store.add(item());
    expect(store.setQuantity(key, 1.5)).toBe('whole-number');
    const fabric = store.add(item({ variantId: null, productType: 'fabric', sku: 'SAR' }));
    expect(store.setQuantity(fabric, 2.5)).toBeNull();
  });

  it('reports what is missing before saving, in order', () => {
    expect(store.problem()).toBe('Choose a supplier.');
    store.supplier.set(supplier);
    expect(store.problem()).toBe('Add at least one item.');
    store.add(item());
    store.expectedDate.set('2026-11-01');
    expect(store.problem()).toBe('Expected date cannot be before the PO date.');
    store.expectedDate.set('2026-11-30');
    expect(store.problem()).toBeNull();
    expect(store.toInput()).toEqual({
      supplierId: 's1',
      poDate: '2026-11-24',
      expectedDate: '2026-11-30',
      notes: '',
      items: [{ productId: 'p1', variantId: 'v1', quantity: 1, rate: 450, discountPercent: 0 }],
    });
  });

  it('tracks unsaved changes', () => {
    expect(store.hasUnsavedChanges()).toBe(false);
    store.add(item());
    expect(store.hasUnsavedChanges()).toBe(true);
    store.markSaved();
    expect(store.hasUnsavedChanges()).toBe(false);
  });

  it('uses IGST for a supplier from another state', () => {
    expect(poSupplyTypeFor('Tamil Nadu', supplier)).toBe('intra');
    expect(poSupplyTypeFor('Tamil Nadu', { gstNumber: '27AABCM9034E1ZL', state: '' })).toBe(
      'inter',
    );
    expect(poSupplyTypeFor('Tamil Nadu', { gstNumber: '', state: 'Kerala' })).toBe('inter');
    expect(poSupplyTypeFor('', { gstNumber: '', state: 'Kerala' })).toBe('intra');
  });
});

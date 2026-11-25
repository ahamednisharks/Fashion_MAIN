import { SellableItem } from '../../core/models/sale.model';
import { BarcodeStore } from './barcode-store';
import { LABEL_LAYOUTS, LabelData, paginateLabels } from './label-layouts';

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
    sku: 'KRT-3001-K-21-MST-M',
    barcode: '',
    hsnCode: '6204',
    gstRate: 5,
    mrp: 999,
    unitPrice: 849,
    status: 'active',
    ...overrides,
  };
}

describe('BarcodeStore', () => {
  let store: BarcodeStore;

  beforeEach(() => {
    store = new BarcodeStore();
  });

  it('adds an item once; adding it again adds a label', () => {
    store.add(item());
    store.add(item());
    store.add(item({ variantId: 'v2', sizeName: 'L' }));
    expect(store.count()).toBe(2);
    expect(store.rows()[0].copies).toBe(2);
    expect(store.rows()[0].bump).toBe(1);
    expect(store.rows()[0].details).toBe('K-21 · M · Mustard');
  });

  it('addMissing skips items already on the list', () => {
    store.add(item());
    expect(store.addMissing([item(), item({ variantId: 'v2' }), item({ variantId: 'v3' })])).toBe(
      2,
    );
    expect(store.count()).toBe(3);
    expect(store.rows()[0].copies).toBe(1);
  });

  it('saves rows without a barcode (typed, or generated when left empty)', () => {
    store.add(item());
    store.add(item({ variantId: 'v2' }));
    store.add(item({ variantId: 'v3', barcode: '2000000000015' }));
    store.setEntered('p1|v2', ' 8901030865279 ');

    expect(store.toSaveCount()).toBe(2);
    expect(store.toGenerateCount()).toBe(1);
    expect(store.assignmentInput()).toEqual([
      { productId: 'p1', variantId: 'v1', barcode: '', replace: false },
      { productId: 'p1', variantId: 'v2', barcode: '8901030865279', replace: false },
    ]);
    expect(store.hasUnsaved()).toBe(true);
  });

  it('changing an existing barcode sends replace and stops its labels', () => {
    store.add(item({ barcode: '2000000000015' }), 3);
    expect(store.labelCount()).toBe(3);
    store.setReplacing('p1|v1', true);
    expect(store.labelCount()).toBe(0);
    expect(store.assignmentInput()).toEqual([
      { productId: 'p1', variantId: 'v1', barcode: '', replace: true },
    ]);
    store.setReplacing('p1|v1', false);
    expect(store.toSaveCount()).toBe(0);
  });

  it('checks the format and duplicates between rows', () => {
    store.add(item());
    store.add(item({ variantId: 'v2' }));
    store.add(item({ variantId: 'v3', barcode: 'ABC-1234' }));

    store.setEntered('p1|v1', 'has space');
    expect(store.rows()[0].error).toMatch(/letters, numbers or hyphens/);

    store.setEntered('p1|v1', 'X-100');
    store.setEntered('p1|v2', 'x-100');
    expect(store.rows()[0].error).toBeNull();
    expect(store.rows()[1].error).toBe('Same barcode as row 1.');

    store.setEntered('p1|v2', 'abc-1234');
    expect(store.rows()[1].error).toBe('Row 3 already has this barcode.');
    // Once row 3 gives up its barcode, another row may take it.
    store.setReplacing('p1|v3', true);
    expect(store.rows()[1].error).toBeNull();
    expect(store.errorCount()).toBe(0);
  });

  it('warns about a 13-digit number with a wrong check digit', () => {
    store.add(item());
    store.setEntered('p1|v1', '2000000000016');
    expect(store.rows()[0].warning).toMatch(/does not match/);
    expect(store.rows()[0].error).toBeNull();
    store.setEntered('p1|v1', '2000000000015');
    expect(store.rows()[0].warning).toBeNull();
  });

  it('applies saved barcodes and places server errors on their row', () => {
    store.add(item({ barcode: '2000000000015' }));
    store.add(item({ variantId: 'v2' }));
    store.add(item({ variantId: 'v3' }));
    store.assignmentInput(); // request rows: v2, v3

    expect(store.applyError('items.1.barcode', 'Already used.')).toBe('p1|v3');
    expect(store.rows()[2].error).toBe('Already used.');
    expect(store.applyError('items', 'Prefix full')).toBeNull();
    expect(store.applyError(undefined, 'Network')).toBeNull();

    store.applySaved([
      {
        productId: 'p1',
        variantId: 'v2',
        barcode: '2000000000022',
        previousBarcode: '',
        generated: true,
      },
      {
        productId: 'p1',
        variantId: 'v3',
        barcode: '2000000000039',
        previousBarcode: '',
        generated: true,
      },
    ]);
    expect(store.rows().map((row) => row.current)).toEqual([
      '2000000000015',
      '2000000000022',
      '2000000000039',
    ]);
    expect(store.rows()[2].error).toBeNull();
    expect(store.toSaveCount()).toBe(0);
    expect(store.hasUnsaved()).toBe(false);
  });

  it('expands labels by copies for rows with a barcode', () => {
    store.add(item({ barcode: '2000000000015' }), 2);
    store.add(item({ variantId: 'v2' }), 5); // no barcode yet: not printable
    store.add(
      item({ variantId: 'v3', barcode: 'MSH-1', designNo: '', sizeName: '', colorName: '' }),
    );
    store.setCopies('p1|v3', 0);
    expect(store.labelCount()).toBe(2);
    expect(store.labels()).toEqual([
      {
        barcode: '2000000000015',
        productName: 'Printed Cotton Kurti',
        details: 'K-21 · M · Mustard',
        mrp: 999,
        price: 849,
      },
      {
        barcode: '2000000000015',
        productName: 'Printed Cotton Kurti',
        details: 'K-21 · M · Mustard',
        mrp: 999,
        price: 849,
      },
    ]);
    store.setAllCopies(1);
    expect(store.labelCount()).toBe(2);
  });

  it('limits copies to 0–999', () => {
    store.add(item({ barcode: '2000000000015' }));
    store.setCopies('p1|v1', 5000);
    expect(store.rows()[0].copies).toBe(999);
    store.setCopies('p1|v1', -3);
    expect(store.rows()[0].copies).toBe(0);
    store.setCopies('p1|v1', Number.NaN);
    expect(store.rows()[0].copies).toBe(1);
  });
});

describe('paginateLabels', () => {
  const label = (n: number): LabelData => ({
    barcode: String(n),
    productName: 'Item',
    details: '',
    mrp: 1,
    price: 1,
  });
  const labels = (count: number) => Array.from({ length: count }, (_, index) => label(index + 1));

  it('prints one label per page on a single roll', () => {
    const pages = paginateLabels(labels(3), LABEL_LAYOUTS['roll-50x25']);
    expect(pages.length).toBe(3);
    expect(pages.every((page) => page.length === 1)).toBe(true);
  });

  it('fills two-across rows and leaves the last half blank', () => {
    const pages = paginateLabels(labels(3), LABEL_LAYOUTS['roll-38x25-2'], 5);
    expect(pages.length).toBe(2);
    expect(pages[1]).toEqual([label(3), null]);
  });

  it('starts an A4 sheet part-way and continues on the next sheet', () => {
    const pages = paginateLabels(labels(70), LABEL_LAYOUTS['a4-65'], 11);
    expect(pages.length).toBe(2);
    expect(pages[0].slice(0, 10).every((cell) => cell === null)).toBe(true);
    expect(pages[0][10]).toEqual(label(1));
    expect(pages[0].length).toBe(65);
    expect(pages[1].length).toBe(15);
    expect(paginateLabels(labels(1), LABEL_LAYOUTS['a4-65'], 999)[0].length).toBe(65);
    expect(paginateLabels([], LABEL_LAYOUTS['a4-65'])).toEqual([]);
  });
});

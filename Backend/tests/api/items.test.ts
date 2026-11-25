import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type TestApi, type TestClient, idByName, startApi } from '../helpers/harness.js';

interface Item {
  productId: string;
  variantId: string | null;
  productName: string;
  productCode: string;
  designNo: string;
  sizeName: string;
  colorName: string;
  sku: string;
  barcode: string;
  categoryName: string;
  mrp: number;
  unitPrice: number;
  status: string;
}
interface Paged<T> {
  items: T[];
  total: number;
}
interface Counts {
  total: number;
  active: number;
  missingBarcode: number;
}
interface Assignment {
  productId: string;
  variantId: string | null;
  barcode: string;
  previousBarcode: string;
  generated: boolean;
}
interface Settings {
  prefix: string;
  lastNumber: number;
  nextBarcode: string;
  labelLayout: string;
  showShopName: boolean;
  showProductName: boolean;
  showDetails: boolean;
  showMrp: boolean;
  showSellingPrice: boolean;
}

let api: TestApi;

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
});

async function items(query = ''): Promise<Paged<Item>> {
  const res = await api.get<Paged<Item>>(`/items?pageSize=100${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

async function bySku(sku: string): Promise<Item> {
  const { items: rows } = await items(`&search=${encodeURIComponent(sku)}`);
  const item = rows.find((row) => row.sku === sku);
  assert.ok(item, `no item ${sku}`);
  return item;
}

async function settings(client: TestClient = api): Promise<Settings> {
  const res = await client.get<Settings>('/settings/barcodes');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

const row = (item: Item, barcode = '', replace = false) => ({
  productId: item.productId,
  variantId: item.variantId,
  barcode,
  replace,
});

function assign(rows: unknown[], client: TestClient = api) {
  return client.post<Assignment[]>('/items/barcodes', { items: rows });
}

describe('items list', () => {
  it('has one row per variant and per product without variants', async () => {
    const all = await items();
    const counts = (await api.get<Counts>('/items/counts')).body.data;
    assert.equal(all.total, counts.total);
    // Seed: 5 shirts + 6 jeans + 8 kurtis + 3 sarees + 4 frocks + 7 polos + 4 kurtas
    //       + 1 stole (no variants) + 3 trousers (inactive) = 41.
    assert.equal(all.total, 41);
    assert.equal(counts.active, 38);

    const stole = all.items.find((item) => item.productCode === 'ACC-8001');
    assert.ok(stole);
    assert.equal(stole.variantId, null);
    assert.equal(stole.sku, 'ACC-8001');
    assert.equal(stole.barcode, '8909876500017');
    assert.equal(stole.categoryName.length > 0, true);
  });

  it('filters by missing / assigned barcode, size and colour', async () => {
    const counts = (await api.get<Counts>('/items/counts')).body.data;
    const missing = await items('&barcode=missing&status=active');
    assert.equal(missing.total, counts.missingBarcode);
    assert.ok(missing.items.every((item) => item.barcode === ''));
    const assigned = await items('&barcode=assigned');
    assert.ok(assigned.items.every((item) => item.barcode !== ''));
    assert.equal(assigned.total, 6); // 5 shirts + the stole

    const m = await idByName(api, 'sizes', 'M');
    const pink = await idByName(api, 'colors', 'Pink');
    const pinkM = await items(`&sizeId=${m}&colorId=${pink}`);
    assert.ok(pinkM.total >= 1);
    assert.ok(pinkM.items.every((item) => item.sizeName === 'M' && item.colorName === 'Pink'));
  });

  it('searches every word across name, design, size and colour', async () => {
    const found = await items('&search=' + encodeURIComponent('kurti k-21 mustard'));
    assert.equal(found.total, 4);
    assert.ok(found.items.every((item) => item.designNo === 'K-21'));
  });

  it('sorts items without a barcode last', async () => {
    for (const order of ['asc', 'desc']) {
      const sorted = await items(`&sortBy=barcode&sortOrder=${order}`);
      const firstMissing = sorted.items.findIndex((item) => item.barcode === '');
      assert.ok(firstMissing > 0);
      assert.ok(sorted.items.slice(firstMissing).every((item) => item.barcode === ''));
    }
  });

  it('keeps a product’s variants together in their own order', async () => {
    const shirts = (await items('&search=MSH-1001')).items.map((item) => item.sku);
    assert.deepEqual(shirts, [
      'MSH-1001-101-BLK-M',
      'MSH-1001-101-BLK-L',
      'MSH-1001-101-WHT-M',
      'MSH-1001-101-WHT-L',
      'MSH-1001-102-RBL-XL',
    ]);
  });
});

describe('barcode settings', () => {
  it('starts at 200… with a 50 x 25 mm label', async () => {
    const current = await settings();
    assert.equal(current.prefix, '200');
    assert.equal(current.lastNumber, 0);
    assert.equal(current.nextBarcode, '2000000000015');
    assert.equal(current.labelLayout, 'roll-50x25');
    assert.equal(current.showMrp, true);
    assert.equal(current.showSellingPrice, false);
  });

  it('validates the prefix and layout', async () => {
    const base = { ...(await settings()) };
    const badPrefix = await api.put('/settings/barcodes', { ...base, prefix: '890' });
    assert.equal(badPrefix.status, 400);
    assert.equal(badPrefix.body.error.field, 'prefix');
    const badLayout = await api.put('/settings/barcodes', { ...base, labelLayout: 'a3' });
    assert.equal(badLayout.status, 400);
  });
});

describe('assigning barcodes', () => {
  it('generates the next shop barcodes in order and makes them scannable', async () => {
    const a = await bySku('JNS-2001-BH-11-IDN-30');
    const b = await bySku('JNS-2001-BH-11-IDN-32');
    const res = await assign([row(a), row(b)]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.data.map((x) => [x.barcode, x.previousBarcode, x.generated]),
      [
        ['2000000000015', '', true],
        ['2000000000022', '', true],
      ],
    );
    assert.equal((await settings()).lastNumber, 2);
    assert.equal((await settings()).nextBarcode, '2000000000039');

    const scanned = await api.get<Item[]>('/sales/items/lookup?code=2000000000015');
    assert.equal(scanned.body.data.length, 1);
    assert.equal(scanned.body.data[0]?.sku, 'JNS-2001-BH-11-IDN-30');
  });

  it("saves a maker's barcode as scanned", async () => {
    const saree = await bySku('SAR-4001-BS-501-MRN-FREESIZE');
    const res = await assign([row(saree, '8901030865279')]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data[0]?.barcode, '8901030865279');
    assert.equal(res.body.data[0]?.generated, false);
    assert.equal((await settings()).lastNumber, 2, 'counter unchanged');
  });

  it('skips numbers that are already on an item', async () => {
    const typed = await bySku('JNS-2001-BH-11-IDN-34');
    const typedRes = await assign([row(typed, '2000000000039')]); // what number 3 would be
    assert.equal(typedRes.status, 200, JSON.stringify(typedRes.body));

    const next = await bySku('JNS-2001-BH-11-IDN-36');
    const res = await assign([row(next)]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data[0]?.barcode, '2000000000046');
    assert.equal((await settings()).lastNumber, 4);
  });

  it('refuses a barcode another item already has', async () => {
    const item = await bySku('JNS-2001-BH-11-BLK-32');
    const res = await assign([row(item, '8901234510011')]);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.field, 'items.0.barcode');
    assert.match(res.body.error.message, /Men's Cotton Casual Shirt/);

    const caseInsensitive = await assign([
      row(item, 'abc-123'),
      row(await bySku('JNS-2001-BH-11-BLK-34'), 'ABC-123'),
    ]);
    assert.equal(caseInsensitive.status, 409);
    assert.equal(caseInsensitive.body.error.field, 'items.1.barcode');
  });

  it('needs replace to change an existing barcode', async () => {
    const shirt = await bySku('MSH-1001-101-BLK-M');
    const refused = await assign([row(shirt)]);
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.field, 'items.0.barcode');
    assert.match(refused.body.error.message, /already has barcode 8901234510011/);

    // Sending the barcode it already has is fine (nothing changes).
    const same = await assign([row(shirt, '8901234510011')]);
    assert.equal(same.status, 200);
    assert.equal(same.body.data[0]?.generated, false);
    assert.equal(same.body.data[0]?.previousBarcode, '8901234510011');

    const replaced = await assign([row(shirt, '', true)]);
    assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
    assert.equal(replaced.body.data[0]?.previousBarcode, '8901234510011');
    assert.equal(replaced.body.data[0]?.barcode, '2000000000053');
    const old = await api.get<Item[]>('/sales/items/lookup?code=8901234510011');
    assert.equal(old.body.data.length, 0, 'the old barcode no longer scans');
  });

  it('is all or nothing', async () => {
    const before = await settings();
    const ok = await bySku('JNS-2001-BH-11-BLK-34');
    const clash = await bySku('KRT-3001-K-21-MST-S');
    const res = await assign([row(ok), row(clash, '8909876500017')]);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.field, 'items.1.barcode');
    assert.equal((await settings()).lastNumber, before.lastNumber, 'no number used');
    assert.equal((await bySku('JNS-2001-BH-11-BLK-34')).barcode, '', 'first row not saved');
  });

  it('checks each row names one existing item, once', async () => {
    const jeans = await bySku('JNS-2001-BH-11-BLK-34');
    const twice = await assign([row(jeans), row(jeans)]);
    assert.equal(twice.status, 400);
    assert.equal(twice.body.error.field, 'items.1.productId');

    const noVariant = await assign([{ ...row(jeans), variantId: null }]);
    assert.equal(noVariant.status, 400);
    assert.equal(noVariant.body.error.field, 'items.0.variantId');
    assert.match(noVariant.body.error.message, /choose the variant/);

    const unknown = await assign([
      { ...row(jeans), variantId: '00000000-0000-4000-8000-000000000000' },
    ]);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.field, 'items.0.variantId');

    const badFormat = await assign([row(jeans, 'no spaces allowed')]);
    assert.equal(badFormat.status, 400);
    assert.equal(badFormat.body.error.field, 'items.0.barcode');

    const empty = await assign([]);
    assert.equal(empty.status, 400);
  });

  it('gives a product without variants its own barcode', async () => {
    const category = await idByName(api, 'categories', 'Sarees');
    const created = await api.post<{ id: string }>('/products', {
      name: 'Cotton Blouse Piece',
      code: 'BLP-100',
      categoryId: category,
      brandId: null,
      productType: 'fabric',
      hsnCode: '5208',
      gstRate: 5,
      mrp: 250,
      sellingPrice: 220,
      purchasePrice: 150,
      barcode: '',
      status: 'active',
      variants: [],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const piece = await bySku('BLP-100');
    assert.equal(piece.variantId, null);

    const res = await assign([row(piece)]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const product = await api.get<{ barcode: string }>(`/products/${created.body.data.id}`);
    assert.equal(product.body.data.barcode, res.body.data[0]?.barcode);
  });

  it('hands out distinct numbers to saves made at the same time', async () => {
    const free = (await items('&barcode=missing&status=active')).items.slice(0, 6);
    assert.equal(free.length, 6);
    const [first, second] = await Promise.all([
      assign(free.slice(0, 3).map((item) => row(item))),
      assign(free.slice(3).map((item) => row(item))),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const codes = [...first.body.data, ...second.body.data].map((x) => x.barcode);
    assert.equal(new Set(codes).size, 6);
  });
});

describe('access', () => {
  let staff: TestClient;

  before(async () => {
    const created = await api.post<{ temporaryPassword: string }>('/users', {
      username: 'labelstaff',
      fullName: 'Label Staff',
      role: 'staff',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    staff = await api.newClient();
    await staff.login('labelstaff', created.body.data.temporaryPassword);
    await staff.post('/auth/change-password', {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: 'Labels#2026x',
    });
  });

  it('lets staff list items, assign barcodes and read the settings', async () => {
    assert.equal((await staff.get('/items')).status, 200);
    const free = (await items('&barcode=missing&status=active')).items[0];
    assert.ok(free);
    const res = await assign([row(free)], staff);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await settings(staff)).prefix, '200');
  });

  it('keeps the settings change for administrators', async () => {
    const current = await settings();
    const denied = await staff.put('/settings/barcodes', { ...current, prefix: '201' });
    assert.equal(denied.status, 403);

    const saved = await api.put<Settings>('/settings/barcodes', {
      prefix: '201',
      labelLayout: 'a4-65',
      showShopName: false,
      showProductName: true,
      showDetails: true,
      showMrp: true,
      showSellingPrice: true,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.labelLayout, 'a4-65');
    assert.equal(saved.body.data.lastNumber, current.lastNumber, 'numbering is not reset');
    assert.ok(saved.body.data.nextBarcode.startsWith('201'));
  });

  it('needs a signed-in user', async () => {
    const anonymous = await api.newClient();
    assert.equal((await anonymous.get('/items')).status, 401);
  });
});

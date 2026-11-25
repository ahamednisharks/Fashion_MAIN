// Must be the FIRST import of every test file: env.ts reads NODE_ENV when it loads, and in
// test mode the API connects to "<DB_NAME>_test" instead of the development database.
import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../../src/config/database.js';
import { financialYearStart } from '../../src/modules/purchase-orders/po-number.js';
import { type TestApi, idByName, startApi } from '../helpers/harness.js';

interface Item {
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string;
  unitPrice: number;
  purchasePrice: number | null;
  status: string;
}
interface Po {
  id: string;
  poNo: string;
  poDate: string;
  expectedDate: string | null;
  supplierId: string;
  supplierName: string;
  supplierGstNumber: string;
  supplierAddress: string;
  supplierState: string;
  supplyType: string;
  notes: string;
  itemCount: number;
  totalQuantity: number;
  grossAmount: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  status: string;
  cancelledAt: string | null;
  createdByName: string;
  updatedByName: string;
  items: {
    lineNo: number;
    sku: string;
    quantity: number;
    rate: number;
    discountPercent: number;
    taxableValue: number;
    cgstAmount: number;
    igstAmount: number;
    lineTotal: number;
    receivedQuantity: number;
    productType: string;
  }[];
}
interface Paged<T> {
  items: T[];
  total: number;
}

let api: TestApi;
/** Today in the shop's time zone, like the server. */
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const fy = financialYearStart(today);
const poNo = (n: number) => `PO-${fy}-${String(n).padStart(5, '0')}`;

let tiruppur: string; // Tamil Nadu — same state as the shop
let mumbai: string; // Maharashtra — another state
let ludhiana: string; // inactive

before(async () => {
  api = await startApi();
  const shop = await api.put('/settings/shop', { shopName: 'Kachi Fashions', state: 'Tamil Nadu' });
  assert.equal(shop.status, 200, JSON.stringify(shop.body));
  tiruppur = await idByName(api, 'suppliers', 'Tiruppur Knit Exports');
  mumbai = await idByName(api, 'suppliers', 'Mumbai Denim Hub');
  ludhiana = await idByName(api, 'suppliers', 'Ludhiana Woollen Mills');
});
after(async () => {
  await api.close();
});

async function lookup(code: string): Promise<Item[]> {
  const res = await api.get<Item[]>(
    `/purchase-orders/items/lookup?code=${encodeURIComponent(code)}`,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

async function one(code: string): Promise<Item> {
  const [item] = await lookup(code);
  assert.ok(item, `no item for ${code}`);
  return item;
}

const line = (item: Item, quantity: number, rate: number, discountPercent = 0) => ({
  productId: item.productId,
  variantId: item.variantId,
  quantity,
  rate,
  discountPercent,
});

describe('purchase order items', () => {
  it('returns the purchase rate with variant overrides', async () => {
    const shirt = await one('8901234510011');
    assert.equal(shirt.purchasePrice, 720);
    assert.equal(shirt.unitPrice, 1299);
    const sarees = await lookup('SAR-4001');
    assert.ok(
      sarees.some((item) => item.purchasePrice === 4800),
      'variant override',
    );
    assert.ok(
      sarees.some((item) => item.purchasePrice === 4200),
      'product price',
    );

    const search = await api.get<Item[]>('/purchase-orders/items?search=kurti%20mustard');
    assert.equal(search.status, 200);
    assert.ok(search.body.data.length > 0);
    assert.ok(search.body.data.every((item) => item.purchasePrice === 450));
  });

  it('keeps purchase rates out of the billing endpoints', async () => {
    const res = await api.get<Record<string, unknown>[]>('/sales/items/lookup?code=8901234510011');
    assert.equal(res.status, 200);
    assert.ok(!('purchasePrice' in (res.body.data[0] ?? {})));
  });
});

describe('purchase orders', () => {
  let first: Po;

  it('previews the next number', async () => {
    const next = await api.get<{ poNo: string }>('/purchase-orders/next-number');
    assert.equal(next.status, 200);
    assert.equal(next.body.data.poNo, poNo(1));
    const lastYear = await api.get<{ poNo: string }>(
      `/purchase-orders/next-number?date=${fy - 1}-06-01`,
    );
    assert.equal(lastYear.body.data.poNo, `PO-${fy - 1}-00001`);
  });

  it('creates a PO with GST added on top (same state: CGST + SGST)', async () => {
    const shirt = await one('8901234510011');
    const kurti = await one('KRT-3001');
    const res = await api.post<Po>('/purchase-orders', {
      supplierId: tiruppur,
      poDate: today,
      expectedDate: null,
      notes: '  Deliver by courier  ',
      items: [line(shirt, 10, 720), line(kurti, 5, 450, 10)],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const po = res.body.data;
    first = po;

    assert.equal(po.poNo, poNo(1));
    assert.equal(po.poDate, today);
    assert.equal(po.status, 'open');
    assert.equal(po.supplierName, 'Tiruppur Knit Exports');
    assert.equal(po.supplierGstNumber, '33ABCPT7712M1ZD');
    assert.ok(po.supplierAddress.length > 0);
    assert.equal(po.supplyType, 'intra');
    assert.equal(po.notes, 'Deliver by courier');
    assert.equal(po.createdByName, 'Shop Admin');
    assert.equal(po.itemCount, 2);
    assert.equal(po.totalQuantity, 15);
    // Shirt: 7,200 + 5% = 7,560. Kurti: 2,250 − 10% = 2,025 + 5% (50.63 × 2) = 2,126.26.
    assert.equal(po.grossAmount, 9450);
    assert.equal(po.discountTotal, 225);
    assert.equal(po.taxableTotal, 9225);
    assert.equal(po.cgstTotal, 230.63);
    assert.equal(po.sgstTotal, 230.63);
    assert.equal(po.igstTotal, 0);
    assert.equal(po.roundOff, -0.26);
    assert.equal(po.grandTotal, 9686);
    assert.deepEqual(
      po.items.map((item) => [item.lineNo, item.sku, item.quantity, item.rate, item.lineTotal]),
      [
        [1, 'MSH-1001-101-BLK-M', 10, 720, 7560],
        [2, kurti.sku, 5, 450, 2126.26],
      ],
    );
    assert.ok(po.items.every((item) => item.receivedQuantity === 0));
    assert.ok(po.items.every((item) => item.productType === 'readymade'));

    const fetched = await api.get<Po>(`/purchase-orders/${po.id}`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body.data.items, po.items);
  });

  it('uses IGST for a supplier in another state', async () => {
    const jeans = await one('JNS-2001');
    const res = await api.post<Po>('/purchase-orders', {
      supplierId: mumbai,
      poDate: today,
      items: [line(jeans, 4, 1100)],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.poNo, poNo(2));
    assert.equal(res.body.data.supplyType, 'inter');
    assert.equal(res.body.data.igstTotal, 220);
    assert.equal(res.body.data.cgstTotal + res.body.data.sgstTotal, 0);
    assert.equal(res.body.data.grandTotal, 4620);
  });

  it('refuses bad input without using up a number', async () => {
    const shirt = await one('8901234510011');
    const kurti = await one('KRT-3001');
    const saree = await one('SAR-4001');
    const inactiveItem = await one('TRS-9001');
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const base = { supplierId: tiruppur, poDate: today, items: [line(shirt, 1, 720)] };

    const cases: [unknown, string, RegExp?][] = [
      [{ ...base, supplierId: ludhiana }, 'supplierId', /inactive supplier/],
      [{ ...base, supplierId: crypto.randomUUID() }, 'supplierId', /does not exist/],
      [{ ...base, items: [line(inactiveItem, 1, 500)] }, 'items.0.productId', /inactive/],
      [
        { ...base, items: [line(shirt, 1, 720), line(shirt, 2, 720)] },
        'items.1.productId',
        /lines 1 and 2/,
      ],
      [{ ...base, items: [line(shirt, 1.5, 720)] }, 'items.0.quantity', /whole number/],
      [{ ...base, items: [line(shirt, 1, 0)] }, 'items.0.rate', /purchase rate/],
      [{ ...base, items: [] }, 'items'],
      [{ ...base, poDate: tomorrow }, 'poDate', /future/],
      [{ ...base, expectedDate: '2001-01-01' }, 'expectedDate', /before the PO date/],
      [{ ...base, items: [{ ...line(kurti, 1, 450), variantId: null }] }, 'items.0.variantId'],
    ];
    for (const [body, field, message] of cases) {
      const res = await api.post('/purchase-orders', body);
      assert.equal(res.status, 400, `${field}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.field, field);
      if (message) assert.match(res.body.error.message, message);
    }

    // Fabric may be ordered in metres; the next number follows on without a gap.
    const fabric = await api.post<Po>('/purchase-orders', {
      ...base,
      items: [line(saree, 12.5, 4200)],
    });
    assert.equal(fabric.status, 201, JSON.stringify(fabric.body));
    assert.equal(fabric.body.data.poNo, poNo(3));
    assert.equal(fabric.body.data.totalQuantity, 12.5);
    assert.equal(fabric.body.data.items[0]?.productType, 'fabric');
  });

  it('edits an open PO and keeps its number', async () => {
    const jeans = await one('JNS-2001');
    const res = await api.put<Po>(`/purchase-orders/${first.id}`, {
      supplierId: mumbai,
      poDate: today,
      expectedDate: today,
      notes: '',
      items: [line(jeans, 2, 1000)],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const po = res.body.data;
    assert.equal(po.poNo, first.poNo);
    assert.equal(po.supplierName, 'Mumbai Denim Hub');
    assert.equal(po.supplyType, 'inter');
    assert.equal(po.expectedDate, today);
    assert.equal(po.itemCount, 1);
    assert.equal(po.grandTotal, 2100);
    assert.equal(po.items[0]?.lineNo, 1);
    assert.equal(po.updatedByName, 'Shop Admin');

    const otherYear = await api.put(`/purchase-orders/${first.id}`, {
      supplierId: mumbai,
      poDate: `${fy - 1}-06-01`,
      items: [line(jeans, 2, 1000)],
    });
    assert.equal(otherYear.status, 400);
    assert.equal(otherYear.body.error.field, 'poDate');
    assert.match(otherYear.body.error.message, /financial year/);

    const missing = await api.put(`/purchase-orders/${crypto.randomUUID()}`, {
      supplierId: mumbai,
      poDate: today,
      items: [line(jeans, 2, 1000)],
    });
    assert.equal(missing.status, 404);
  });

  it('locks a PO once goods are received against it', async () => {
    const shirt = await one('8901234510011');
    const created = await api.post<Po>('/purchase-orders', {
      supplierId: tiruppur,
      poDate: today,
      items: [line(shirt, 6, 720)],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    // As a purchase entry would (see purchase-entries.test.ts).
    await pool.query('UPDATE purchase_order_items SET received_quantity = 2 WHERE po_id = $1', [
      created.body.data.id,
    ]);
    const edit = await api.put(`/purchase-orders/${created.body.data.id}`, {
      supplierId: tiruppur,
      poDate: today,
      items: [line(shirt, 8, 720)],
    });
    assert.equal(edit.status, 400);
    assert.match(edit.body.error.message, /received/);
    const cancel = await api.post(`/purchase-orders/${created.body.data.id}/cancel`);
    assert.equal(cancel.status, 400);
  });

  it('cancels an open PO, which then cannot be changed', async () => {
    const shirt = await one('8901234510011');
    const created = await api.post<Po>('/purchase-orders', {
      supplierId: tiruppur,
      poDate: today,
      items: [line(shirt, 3, 720)],
    });
    const id = created.body.data.id;
    const cancelled = await api.post<Po>(`/purchase-orders/${id}/cancel`);
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.status, 'cancelled');
    assert.ok(cancelled.body.data.cancelledAt);

    const again = await api.post(`/purchase-orders/${id}/cancel`);
    assert.equal(again.status, 400);
    assert.match(again.body.error.message, /already cancelled/);
    const edit = await api.put(`/purchase-orders/${id}`, {
      supplierId: tiruppur,
      poDate: today,
      items: [line(shirt, 1, 720)],
    });
    assert.equal(edit.status, 400);
    assert.match(edit.body.error.message, /cancelled/);
  });

  it('lists, searches and filters POs (newest first)', async () => {
    const all = await api.get<Paged<{ poNo: string; status: string }>>(
      '/purchase-orders?pageSize=50',
    );
    assert.equal(all.status, 200);
    assert.equal(all.body.data.total, 5);
    assert.equal(all.body.data.items[0]?.poNo, poNo(5));

    const bySupplierName = await api.get<Paged<unknown>>('/purchase-orders?search=mumbai');
    assert.equal(bySupplierName.body.data.total, 2);
    const byNumber = await api.get<Paged<unknown>>(`/purchase-orders?search=${poNo(3)}`);
    assert.equal(byNumber.body.data.total, 1);
    const cancelled = await api.get<Paged<unknown>>('/purchase-orders?status=cancelled');
    assert.equal(cancelled.body.data.total, 1);
    const bySupplier = await api.get<Paged<unknown>>(`/purchase-orders?supplierId=${tiruppur}`);
    assert.equal(bySupplier.body.data.total, 3);
    const inPeriod = await api.get<Paged<unknown>>(`/purchase-orders?from=${today}&to=${today}`);
    assert.equal(inPeriod.body.data.total, 5);
    const otherPeriod = await api.get<Paged<unknown>>(
      '/purchase-orders?from=2001-01-01&to=2001-12-31',
    );
    assert.equal(otherPeriod.body.data.total, 0);
    const reversed = await api.get('/purchase-orders?from=2026-12-31&to=2026-01-01');
    assert.equal(reversed.status, 400);
    assert.equal((await api.get(`/purchase-orders/${crypto.randomUUID()}`)).status, 404);
  });

  it('protects suppliers and products on POs from deletion', async () => {
    const supplier = await api.delete(`/suppliers/${tiruppur}`);
    assert.equal(supplier.status, 409);
    assert.equal(supplier.body.error.code, 'IN_USE');
    assert.match(supplier.body.error.message, /purchase orders/);

    const saree = await one('SAR-4001');
    const product = await api.delete(`/products/${saree.productId}`);
    assert.equal(product.status, 409);
    assert.match(product.body.error.message, /purchase orders/);
  });

  it('is for administrators only', async () => {
    const created = await api.post<{ temporaryPassword: string }>('/users', {
      username: 'postaff',
      fullName: 'Counter Staff',
      role: 'staff',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const staff = await api.newClient();
    await staff.login('postaff', created.body.data.temporaryPassword);
    await staff.post('/auth/change-password', {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: 'Purchase#2026x',
    });
    assert.equal((await staff.get('/purchase-orders')).status, 403);
    assert.equal((await staff.get('/purchase-orders/items?search=kurti')).status, 403);
    assert.equal((await (await api.newClient()).get('/purchase-orders')).status, 401);
  });
});

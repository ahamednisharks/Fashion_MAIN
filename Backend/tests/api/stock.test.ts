// Must be the FIRST import of every test file: env.ts reads NODE_ENV when it loads, and in
// test mode the API connects to "<DB_NAME>_test" instead of the development database.
import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../../src/config/database.js';
import { type TestApi, idByName, startApi } from '../helpers/harness.js';

interface Item {
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string;
  unitPrice: number;
  stock: number;
}
interface Entry {
  id: string;
  peNo: string;
}
interface History {
  stock: number;
  totalMovements: number;
  movements: {
    date: string;
    kind: string;
    sourceType: string;
    sourceNo: string;
    quantity: number;
    balance: number;
  }[];
}
interface Paged<T> {
  items: T[];
  total: number;
}

let api: TestApi;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
let tiruppur: string;

before(async () => {
  api = await startApi();
  tiruppur = await idByName(api, 'suppliers', 'Tiruppur Knit Exports');
});
after(async () => {
  await api.close();
});

async function item(code: string, path = '/sales/items/lookup'): Promise<Item> {
  const res = await api.get<Item[]>(`${path}?code=${encodeURIComponent(code)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [found] = res.body.data;
  assert.ok(found, `no item for ${code}`);
  return found;
}

const stockOf = async (code: string) => (await item(code)).stock;

let invoiceCounter = 0;
function entryBody(lines: { item: Item; quantity: number; rate?: number }[]) {
  invoiceCounter += 1;
  return {
    supplierId: tiruppur,
    supplierInvoiceNo: `STK-${invoiceCounter}`,
    supplierInvoiceDate: today,
    entryDate: today,
    items: lines.map(({ item: i, quantity, rate }) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity,
      rate: rate ?? 500,
      discountPercent: 0,
    })),
  };
}

async function sell(lines: { item: Item; quantity: number }[]) {
  const total = lines.reduce((sum, line) => sum + line.item.unitPrice * line.quantity, 0);
  return api.post<{ invoiceNo: string }>('/sales/invoices', {
    items: lines.map(({ item: i, quantity }) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity,
      discountPercent: 0,
      unitPrice: i.unitPrice,
    })),
    payments: [{ mode: 'cash', amount: Math.ceil(total) + 10 }],
  });
}

async function history(i: Item): Promise<History> {
  const variant = i.variantId ? `&variantId=${i.variantId}` : '';
  const res = await api.get<History>(`/stock/history?productId=${i.productId}${variant}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

describe('stock', () => {
  let shirt: Item;
  let kurti: Item;
  let stole: Item;
  let entry: Entry;

  it('starts at zero and shows stock on every item list', async () => {
    shirt = await item('8901234510011');
    kurti = await item('KRT-3001');
    stole = await item('ACC-8001');
    assert.equal(shirt.stock, 0);
    assert.equal((await item('8901234510011', '/purchase-orders/items/lookup')).stock, 0);
    const list = await api.get<Paged<Item>>('/items?search=MSH-1001-101-BLK-M');
    assert.equal(list.body.data.items[0]?.stock, 0);
  });

  it('adds received goods to stock (purchase entry)', async () => {
    const res = await api.post<Entry>(
      '/purchase-entries',
      entryBody([
        { item: shirt, quantity: 6, rate: 720 },
        { item: kurti, quantity: 5, rate: 450 },
      ]),
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    entry = res.body.data;
    assert.equal(await stockOf('8901234510011'), 6);
    assert.equal((await item('KRT-3001')).stock, 5);
    assert.equal((await item('8901234510011', '/purchase-orders/items/lookup')).stock, 6);

    const { rows } = await pool.query<{ unitCost: number; kind: string; sourceNo: string }>(
      `SELECT unit_cost AS "unitCost", kind, source_no AS "sourceNo"
         FROM stock_movements WHERE source_id = $1 ORDER BY source_line`,
      [entry.id],
    );
    assert.deepEqual(rows, [
      { unitCost: 720, kind: 'purchase', sourceNo: entry.peNo },
      { unitCost: 450, kind: 'purchase', sourceNo: entry.peNo },
    ]);
  });

  it('takes sold goods out of stock (bill), even below zero', async () => {
    const bill = await sell([
      { item: shirt, quantity: 2 },
      { item: stole, quantity: 1 },
    ]);
    assert.equal(bill.status, 201, JSON.stringify(bill.body));
    assert.equal(await stockOf('8901234510011'), 4);
    // Never received: selling is allowed and the stock goes below zero.
    assert.equal(await stockOf('ACC-8001'), -1);
  });

  it('follows edits and cancellation of the purchase entry', async () => {
    // 6 → 3 shirts, kurti taken off the entry, stole added.
    const edited = await api.put(
      `/purchase-entries/${entry.id}`,
      entryBody([
        { item: shirt, quantity: 3, rate: 720 },
        { item: stole, quantity: 4, rate: 220 },
      ]),
    );
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(await stockOf('8901234510011'), 1);
    assert.equal(await stockOf('KRT-3001'), 0);
    assert.equal(await stockOf('ACC-8001'), 3);

    const cancelled = await api.post(`/purchase-entries/${entry.id}/cancel`);
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(await stockOf('8901234510011'), -2);
    assert.equal(await stockOf('ACC-8001'), -1);
  });

  it("lists an item's movements with the running balance", async () => {
    const res = await api.post<Entry>(
      '/purchase-entries',
      entryBody([{ item: shirt, quantity: 10, rate: 700 }]),
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const shirtHistory = await history(shirt);
    assert.equal(shirtHistory.stock, 8);
    assert.equal(shirtHistory.totalMovements, 2);
    assert.deepEqual(
      shirtHistory.movements.map((m) => [m.kind, m.sourceType, m.quantity, m.balance]),
      [
        ['purchase', 'purchase_entry', 10, 8],
        ['sale', 'sales_invoice', -2, -2],
      ],
    );
    assert.match(shirtHistory.movements[1]?.sourceNo ?? '', /^INV\//);
    assert.equal(shirtHistory.movements[0]?.date, today);

    // A product without variants; an item that never moved.
    assert.equal((await history(stole)).stock, -1);
    const never = await item('JNS-2001');
    assert.deepEqual(await history(never), {
      productId: never.productId,
      variantId: never.variantId,
      stock: 0,
      totalMovements: 0,
      movements: [],
    });
    const missing = await api.get(`/stock/history?productId=${crypto.randomUUID()}`);
    assert.equal(missing.status, 404);
    assert.equal((await api.get('/stock/history?productId=nope')).status, 400);
  });

  it('filters, sorts and counts items by stock', async () => {
    const count = async (query: string) =>
      (await api.get<Paged<Item>>(`/items?${query}&pageSize=100`)).body.data;
    const inStock = await count('stock=in');
    assert.deepEqual(
      inStock.items.map((i) => [i.sku, i.stock]),
      [[shirt.sku, 8]],
    );
    const negative = await count('stock=negative');
    assert.deepEqual(
      negative.items.map((i) => [i.sku, i.stock]),
      [[stole.sku, -1]],
    );
    const out = await count('stock=out');
    assert.ok(out.items.every((i) => i.stock <= 0));
    assert.ok(out.items.some((i) => i.sku === stole.sku));

    const sorted = await count('sortBy=stock&sortOrder=desc');
    assert.equal(sorted.items[0]?.sku, shirt.sku);
    assert.equal(sorted.items.at(-1)?.sku, stole.sku);

    const counts = await api.get<{ belowZero: number }>('/items/counts');
    assert.equal(counts.body.data.belowZero, 1);
  });

  it('keeps the count right when bills are saved at the same time', async () => {
    const before = await stockOf('8901234510011');
    const results = await Promise.all(
      Array.from({ length: 6 }, () => sell([{ item: shirt, quantity: 1 }])),
    );
    assert.ok(
      results.every((res) => res.status === 201),
      JSON.stringify(results.map((r) => r.body)),
    );
    assert.equal(await stockOf('8901234510011'), before - 6);
  });

  it('can be rebuilt from the documents with the same result', async () => {
    const snapshot = async () =>
      (
        await pool.query<{ key: string; quantity: number }>(
          `SELECT product_id || '|' || COALESCE(variant_id::text, '') AS key, quantity
             FROM stock_levels WHERE quantity <> 0 ORDER BY 1`,
        )
      ).rows;
    const movements = async () =>
      (await pool.query<{ total: number }>('SELECT count(*)::int AS total FROM stock_movements'))
        .rows[0]?.total;
    const levelsBefore = await snapshot();
    const movementsBefore = await movements();
    await pool.query('SELECT rebuild_stock()');
    assert.deepEqual(await snapshot(), levelsBefore);
    assert.equal(await movements(), movementsBefore);
  });
});

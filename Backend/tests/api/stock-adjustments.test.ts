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
  productType: string;
  sku: string;
  unitPrice: number;
  stock: number;
  purchasePrice?: number | null;
  status: string;
}
interface AdjustmentLine {
  lineNo: number;
  sku: string;
  systemQuantity: number;
  countedQuantity: number | null;
  quantity: number;
  unitCost: number | null;
  value: number;
  note: string;
}
interface Adjustment {
  id: string;
  adjNo: string;
  adjustmentDate: string;
  mode: string;
  reason: string;
  notes: string;
  itemCount: number;
  quantityIn: number;
  quantityOut: number;
  valueIn: number;
  valueOut: number;
  status: string;
  cancelledByName: string | null;
  createdByName: string;
  items: AdjustmentLine[];
}
interface Paged<T> {
  items: T[];
  total: number;
}

let api: TestApi;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const [year = 0, month = 0] = today.split('-').map(Number);
const financialYear = month >= 4 ? year : year - 1;
const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toLocaleDateString('en-CA', {
  timeZone: 'Asia/Kolkata',
});

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
});

async function item(code: string): Promise<Item> {
  const res = await api.get<Item[]>(
    `/purchase-orders/items/lookup?code=${encodeURIComponent(code)}`,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [found] = res.body.data;
  assert.ok(found, `no item for ${code}`);
  return found;
}

const stockOf = async (code: string) => (await item(code)).stock;

async function sell(target: Item, quantity: number) {
  const res = await api.post('/sales/invoices', {
    items: [
      {
        productId: target.productId,
        variantId: target.variantId,
        quantity,
        discountPercent: 0,
        unitPrice: target.unitPrice,
      },
    ],
    payments: [{ mode: 'cash', amount: Math.ceil(target.unitPrice * quantity) + 10 }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
}

const ref = (i: Item) => ({ productId: i.productId, variantId: i.variantId });

/** A count-mode line as the screen sends it: the stock it showed and the count. */
const counted = (i: Item, quantity: number, unitCost: number | null = null) => ({
  ...ref(i),
  systemQuantity: i.stock,
  countedQuantity: quantity,
  unitCost,
});

const changed = (i: Item, quantity: number, unitCost: number | null = null) => ({
  ...ref(i),
  quantity,
  unitCost,
});

function body(
  mode: 'count' | 'change',
  reason: string,
  items: unknown[],
  extra: Record<string, unknown> = {},
) {
  return { adjustmentDate: today, mode, reason, notes: '', items, ...extra };
}

async function save(payload: unknown): Promise<Adjustment> {
  const res = await api.post<Adjustment>('/stock-adjustments', payload);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function refused(payload: unknown, field: string | RegExp, message?: RegExp) {
  const res = await api.post('/stock-adjustments', payload);
  assert.equal(res.status, 400, JSON.stringify(res.body));
  if (typeof field === 'string') assert.equal(res.body.error.field, field);
  else assert.match(res.body.error.field ?? '', field);
  if (message) assert.match(res.body.error.message, message);
  return res.body.error;
}

describe('stock adjustments', () => {
  let shirt: Item;
  let stole: Item;
  let kurti: Item;
  let opening: Adjustment;

  it('previews the first number and loads items with stock and purchase price', async () => {
    const next = await api.get<{ adjNo: string }>('/stock-adjustments/next-number');
    assert.equal(next.status, 200);
    assert.equal(next.body.data.adjNo, `ADJ-${financialYear}-00001`);

    // Sold before it was ever entered: below zero.
    stole = await item('ACC-8001');
    await sell(stole, 2);
    const negative = await api.get<Item[]>('/stock-adjustments/items?stock=negative');
    assert.equal(negative.status, 200, JSON.stringify(negative.body));
    assert.deepEqual(
      negative.body.data.map((i) => [i.sku, i.stock]),
      [[stole.sku, -2]],
    );
    assert.ok('purchasePrice' in (negative.body.data[0] ?? {}));

    const categoryId = await idByName(api, 'categories', "Men's Shirts");
    const shirts = await api.get<Item[]>(`/stock-adjustments/items?categoryId=${categoryId}`);
    assert.equal(shirts.body.data.length, 5);
    assert.ok(
      shirts.body.data.every((i) => i.sku.startsWith('MSH-1001') && i.purchasePrice === 720),
    );
    const limited = await api.get<Item[]>(
      `/stock-adjustments/items?categoryId=${categoryId}&limit=2`,
    );
    assert.equal(limited.body.data.length, 2);
    assert.equal((await api.get('/stock-adjustments/items?stock=minus')).status, 400);
  });

  it('enters opening stock as a count: the change is counted − in stock', async () => {
    stole = await item('ACC-8001');
    shirt = await item('8901234510011');
    kurti = await item('KRT-3001');
    opening = await save(
      body('count', 'opening_stock', [
        { ...counted(stole, 10, 150), note: 'Shelf B' },
        counted(shirt, 4, 720),
        // Counted and matched: kept on the adjustment, no stock movement.
        counted(kurti, 0),
      ]),
    );
    assert.match(opening.adjNo, new RegExp(`^ADJ-${financialYear}-00001$`));
    assert.equal(opening.mode, 'count');
    assert.equal(opening.reason, 'opening_stock');
    assert.equal(opening.status, 'posted');
    assert.equal(opening.createdByName.length > 0, true);
    assert.deepEqual(
      opening.items.map((l) => [l.sku, l.systemQuantity, l.countedQuantity, l.quantity, l.value]),
      [
        [stole.sku, -2, 10, 12, 1800],
        [shirt.sku, 0, 4, 4, 2880],
        [kurti.sku, 0, 0, 0, 0],
      ],
    );
    assert.equal(opening.items[0]?.note, 'Shelf B');
    assert.equal(opening.items[2]?.unitCost, null);
    assert.deepEqual(
      [
        opening.itemCount,
        opening.quantityIn,
        opening.quantityOut,
        opening.valueIn,
        opening.valueOut,
      ],
      [3, 16, 0, 4680, 0],
    );
    assert.equal(await stockOf('ACC-8001'), 10);
    assert.equal(await stockOf('8901234510011'), 4);
    assert.equal(await stockOf('KRT-3001'), 0);

    const { rows } = await pool.query<{ sourceLine: number; quantity: number; unitCost: number }>(
      `SELECT source_line AS "sourceLine", quantity, unit_cost AS "unitCost"
         FROM stock_movements
        WHERE source_type = 'stock_adjustment' AND source_id = $1 AND kind = 'adjustment'
        ORDER BY source_line`,
      [opening.id],
    );
    assert.deepEqual(rows, [
      { sourceLine: 1, quantity: 12, unitCost: 150 },
      { sourceLine: 2, quantity: 4, unitCost: 720 },
    ]);

    const history = await api.get<{
      movements: { kind: string; sourceNo: string; balance: number }[];
    }>(`/stock/history?productId=${stole.productId}`);
    assert.deepEqual(
      history.body.data.movements.map((m) => [m.kind, m.sourceNo, m.balance]),
      [
        ['adjustment', opening.adjNo, 10],
        ['sale', history.body.data.movements[1]?.sourceNo, -2],
      ],
    );
  });

  it('refuses a count when the stock moved after the screen showed it', async () => {
    shirt = await item('8901234510011'); // 4 in stock
    stole = await item('ACC-8001'); // 10 in stock
    const stale = { ...counted(shirt, 3), systemQuantity: 5 };
    const error = await refused(
      body('count', 'stock_count', [counted(stole, 10), stale]),
      'items.1.systemQuantity',
      /in stock is now 4 \(the screen showed 5\)/,
    );
    assert.deepEqual(
      error.details?.map((d) => d.field),
      ['items.1.systemQuantity'],
    );
    // Several lines: one message, every line in the details.
    const many = await refused(
      body('count', 'stock_count', [{ ...counted(stole, 9), systemQuantity: 8 }, stale]),
      'items.0.systemQuantity',
      /stock of 2 items has changed/,
    );
    assert.equal(many.details?.length, 2);
    // Nothing was saved and no number was used up.
    assert.equal(await stockOf('8901234510011'), 4);
    const next = await api.get<{ adjNo: string }>('/stock-adjustments/next-number');
    assert.equal(next.body.data.adjNo, `ADJ-${financialYear}-00002`);

    // Without systemQuantity the stock at save time is used as it is.
    const unchecked = await save(
      body('count', 'stock_count', [{ ...ref(shirt), countedQuantity: 3 }]),
    );
    assert.equal(unchecked.items[0]?.quantity, -1);
    assert.equal(await stockOf('8901234510011'), 3);
  });

  it('adds and takes out quantities in change mode, in the direction of the reason', async () => {
    shirt = await item('8901234510011'); // 3
    const damaged = await save(
      body('change', 'damaged', [changed(shirt, -2, 720)], { notes: 'Water damage' }),
    );
    assert.deepEqual(
      damaged.items.map((l) => [l.systemQuantity, l.countedQuantity, l.quantity, l.value]),
      [[3, null, -2, -1440]],
    );
    assert.deepEqual(
      [damaged.quantityIn, damaged.quantityOut, damaged.valueIn, damaged.valueOut],
      [0, 2, 0, 1440],
    );
    assert.equal(await stockOf('8901234510011'), 1);

    await refused(
      body('change', 'damaged', [changed(shirt, 1)]),
      'items.0.quantity',
      /damaged goods can only be taken out of stock/,
    );
    await refused(
      body('change', 'lost', [changed(shirt, 2)]),
      'items.0.quantity',
      /lost \/ stolen goods can only be taken out/,
    );
    await refused(
      body('change', 'found', [changed(shirt, -1)]),
      'items.0.quantity',
      /found goods can only be added/,
    );
    // Count mode follows the same rule: counting more than in stock is not "damaged".
    shirt = await item('8901234510011');
    await refused(
      body('count', 'damaged', [counted(shirt, 5)]),
      'items.0.countedQuantity',
      /would go up by 4/,
    );
    const found = await save(body('change', 'found', [changed(shirt, 1)]));
    assert.equal(found.items[0]?.quantity, 1);
    assert.equal(await stockOf('8901234510011'), 2);
  });

  it('checks the lines and the header', async () => {
    shirt = await item('8901234510011');
    stole = await item('ACC-8001');
    const saree = (await api.get<Item[]>('/purchase-orders/items?search=SAR-4001')).body.data[0];
    assert.ok(saree && saree.productType === 'fabric');

    await refused(
      body('count', 'stock_count', [{ ...ref(shirt) }]),
      'items.0.countedQuantity',
      /enter the quantity counted/,
    );
    await refused(
      body('change', 'other', [changed(shirt, 0)], { notes: 'x' }),
      'items.0.quantity',
      /cannot be 0/,
    );
    await refused(
      body('change', 'stock_count', [ref(shirt)]),
      'items.0.quantity',
      /enter the quantity to add/,
    );
    await refused(
      body('change', 'stock_count', [changed(shirt, 1.5)]),
      'items.0.quantity',
      /whole number/,
    );
    await refused(body('count', 'stock_count', [counted(shirt, -1)]), 'items.0.countedQuantity');
    await refused(
      body('change', 'stock_count', [changed(shirt, 1), changed(shirt, 2)]),
      'items.1.productId',
      /lines 1 and 2/,
    );
    await refused(
      body('change', 'stock_count', [{ productId: shirt.productId, quantity: 1 }]),
      'items.0.variantId',
      /choose a size/,
    );
    await refused(
      body('change', 'stock_count', [{ productId: crypto.randomUUID(), quantity: 1 }]),
      'items.0.productId',
      /no longer exists/,
    );
    await refused(body('change', 'other', [changed(shirt, 1)]), 'notes', /Other/);
    await refused(
      body('change', 'stock_count', [changed(shirt, 1)], { adjustmentDate: tomorrow }),
      'adjustmentDate',
      /future/,
    );
    await refused(body('change', 'stock_count', []), 'items');
    await refused(
      { ...body('change', 'stock_count', [changed(shirt, 1)]), reason: 'theft' },
      'reason',
    );
    await refused({ ...body('change', 'stock_count', [changed(shirt, 1)]), mode: 'set' }, 'mode');

    // Fabric is counted in metres; an inactive item's stock can still be corrected.
    const metres = await save(body('change', 'found', [changed(saree, 2.5)]));
    assert.equal(metres.items[0]?.quantity, 2.5);
    await pool.query(`UPDATE products SET status = 'inactive' WHERE id = $1`, [stole.productId]);
    const writeOff = await save(body('change', 'lost', [changed(stole, -1)]));
    assert.equal(writeOff.items[0]?.quantity, -1);
    await pool.query(`UPDATE products SET status = 'active' WHERE id = $1`, [stole.productId]);
  });

  it('reverses the stock change when cancelled, once', async () => {
    const before = await stockOf('ACC-8001');
    const res = await api.post<Adjustment>(`/stock-adjustments/${opening.id}/cancel`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'cancelled');
    assert.ok(res.body.data.cancelledByName);
    assert.equal(await stockOf('ACC-8001'), before - 12);
    const again = await api.post(`/stock-adjustments/${opening.id}/cancel`);
    assert.equal(again.status, 400);
    assert.match(again.body.error.message, /already cancelled/);
    assert.equal((await api.post(`/stock-adjustments/${crypto.randomUUID()}/cancel`)).status, 404);
    assert.equal((await api.get(`/stock-adjustments/${crypto.randomUUID()}`)).status, 404);
  });

  it('lists adjustments newest first with filters', async () => {
    const all = await api.get<Paged<Adjustment>>('/stock-adjustments?pageSize=50');
    assert.equal(all.status, 200, JSON.stringify(all.body));
    assert.equal(all.body.data.total, 6);
    assert.equal(all.body.data.items.at(-1)?.adjNo, opening.adjNo);

    const damaged = await api.get<Paged<Adjustment>>('/stock-adjustments?reason=damaged');
    assert.deepEqual(
      damaged.body.data.items.map((a) => a.reason),
      ['damaged'],
    );
    const cancelled = await api.get<Paged<Adjustment>>('/stock-adjustments?status=cancelled');
    assert.deepEqual(
      cancelled.body.data.items.map((a) => a.adjNo),
      [opening.adjNo],
    );
    const search = await api.get<Paged<Adjustment>>('/stock-adjustments?search=water');
    assert.equal(search.body.data.total, 1);
    const dated = await api.get<Paged<Adjustment>>(`/stock-adjustments?from=${tomorrow}`);
    assert.equal(dated.body.data.total, 0);
    assert.equal((await api.get(`/stock-adjustments?from=${tomorrow}&to=${today}`)).status, 400);
  });

  it('gives the stock of several items in the order asked', async () => {
    shirt = await item('8901234510011');
    stole = await item('ACC-8001');
    const res = await api.post<{ productId: string; stock: number }[]>('/stock/levels', {
      items: [ref(stole), ref(shirt), { productId: crypto.randomUUID() }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.data.map((level) => level.stock),
      [stole.stock, shirt.stock, 0],
    );
    assert.equal((await api.post('/stock/levels', { items: [] })).status, 400);
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
      (
        await pool.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM stock_movements WHERE source_type = 'stock_adjustment'`,
        )
      ).rows[0]?.total;
    const levelsBefore = await snapshot();
    const movementsBefore = await movements();
    assert.ok((movementsBefore ?? 0) > 0);
    await pool.query('SELECT rebuild_stock()');
    assert.deepEqual(await snapshot(), levelsBefore);
    assert.equal(await movements(), movementsBefore);
  });

  it('is for administrators only', async () => {
    const created = await api.post<{ temporaryPassword: string }>('/users', {
      username: 'adjstaff',
      fullName: 'Counter Staff',
      role: 'staff',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const staff = await api.newClient();
    await staff.login('adjstaff', created.body.data.temporaryPassword);
    await staff.post('/auth/change-password', {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: 'Adjust#2026x',
    });
    assert.equal((await staff.get('/stock-adjustments')).status, 403);
    assert.equal((await staff.get('/stock-adjustments/items')).status, 403);
    assert.equal((await staff.post('/stock-adjustments', {})).status, 403);
    // Stock levels are not secret (every item list shows them).
    assert.equal((await staff.post('/stock/levels', { items: [ref(shirt)] })).status, 200);
    assert.equal((await (await api.newClient()).get('/stock-adjustments')).status, 401);
  });
});

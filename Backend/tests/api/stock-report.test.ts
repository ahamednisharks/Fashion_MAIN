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
interface StockTotals {
  opening: number;
  purchased: number;
  sold: number;
  adjusted: number;
  closing: number;
  stockValue: number;
}
interface Row extends StockTotals {
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string;
  brandName: string;
  sizeName: string;
  colorName: string;
  categoryName: string;
  purchaseRate: number | null;
}
interface Report {
  from: string;
  to: string;
  totals: StockTotals & { itemCount: number };
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
interface ExportReport {
  from: string;
  to: string;
  totals: StockTotals & { itemCount: number };
  items: Row[];
  truncated: boolean;
}

let api: TestApi;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
});

async function item(code: string): Promise<Item> {
  const res = await api.get<Item[]>(`/sales/items/lookup?code=${encodeURIComponent(code)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [found] = res.body.data;
  assert.ok(found, `no item for ${code}`);
  return found;
}

const ref = (i: Item) => ({ productId: i.productId, variantId: i.variantId });

/** Documents are saved with today's date; their stock movements are then moved to `date`. */
async function moveTo(sourceId: string, date: string): Promise<void> {
  await pool.query('UPDATE stock_movements SET movement_date = $1 WHERE source_id = $2', [
    date,
    sourceId,
  ]);
}

let invoiceCounter = 0;
async function receive(date: string, lines: { item: Item; quantity: number; rate: number }[]) {
  invoiceCounter += 1;
  const res = await api.post<{ id: string }>('/purchase-entries', {
    supplierId: await idByName(api, 'suppliers', 'Tiruppur Knit Exports'),
    supplierInvoiceNo: `SR-${invoiceCounter}`,
    supplierInvoiceDate: today,
    entryDate: today,
    items: lines.map(({ item: i, quantity, rate }) => ({
      ...ref(i),
      quantity,
      rate,
      discountPercent: 0,
    })),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  await moveTo(res.body.data.id, date);
}

async function sell(date: string, target: Item, quantity: number) {
  const res = await api.post<{ id: string }>('/sales/invoices', {
    items: [{ ...ref(target), quantity, discountPercent: 0, unitPrice: target.unitPrice }],
    payments: [{ mode: 'cash', amount: Math.ceil(target.unitPrice * quantity) + 10 }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  await moveTo(res.body.data.id, date);
}

async function adjust(date: string, target: Item, quantity: number, reason: string) {
  const res = await api.post<{ id: string }>('/stock-adjustments', {
    adjustmentDate: today,
    mode: 'change',
    reason,
    notes: '',
    items: [{ ...ref(target), quantity, unitCost: null }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  await moveTo(res.body.data.id, date);
}

async function report(query: string): Promise<Report> {
  const res = await api.get<Report>(`/reports/stock?${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

const OCTOBER = 'from=2026-10-01&to=2026-10-31';

const pick = (row: Row | undefined) =>
  row && {
    opening: row.opening,
    purchased: row.purchased,
    sold: row.sold,
    adjusted: row.adjusted,
    closing: row.closing,
    stockValue: row.stockValue,
  };

describe('stock report', () => {
  let shirt: Item; // Urban Weave, Black / M
  let kurti: Item; // Kalaa, Mustard / S
  let stole: Item; // Shop Label, no variants

  before(async () => {
    shirt = await item('8901234510011');
    kurti = await item('KRT-3001');
    stole = await item('8909876500017');

    // Before October: 10 shirts and 5 kurtis received.
    await receive('2026-09-15', [
      { item: shirt, quantity: 10, rate: 700 },
      { item: kurti, quantity: 5, rate: 450 },
    ]);
    // In October: 4 more shirts, 3 sold, 1 damaged; 1 kurti sold; 2 stoles sold (never received).
    await receive('2026-10-10', [{ item: shirt, quantity: 4, rate: 720 }]);
    await sell('2026-10-12', shirt, 3);
    await adjust('2026-10-15', shirt, -1, 'damaged');
    await sell('2026-10-31', kurti, 1);
    await sell('2026-10-20', stole, 2);
    // After October: does not count.
    await sell('2026-11-02', shirt, 1);
  });

  it('gives opening, in, out, adjustment and closing stock per item', async () => {
    const october = await report(OCTOBER);
    assert.equal(october.from, '2026-10-01');
    assert.equal(october.to, '2026-10-31');
    assert.deepEqual(
      october.items.map((row) => row.sku),
      [shirt.sku, kurti.sku, stole.sku],
      'items with stock or a movement, by name',
    );
    const [shirtRow, kurtiRow, stoleRow] = october.items;
    assert.deepEqual(pick(shirtRow), {
      opening: 10,
      purchased: 4,
      sold: 3,
      adjusted: -1,
      closing: 10,
      stockValue: 7200, // 10 × the latest purchase rate (₹720)
    });
    assert.equal(shirtRow?.purchaseRate, 720);
    assert.equal(shirtRow?.brandName, 'Urban Weave');
    assert.equal(shirtRow?.sizeName, 'M');
    assert.equal(shirtRow?.colorName, 'Black');
    assert.deepEqual(pick(kurtiRow), {
      opening: 5,
      purchased: 0,
      sold: 1,
      adjusted: 0,
      closing: 4,
      stockValue: 1800,
    });
    assert.deepEqual(
      pick(stoleRow),
      { opening: 0, purchased: 0, sold: 2, adjusted: 0, closing: -2, stockValue: 0 },
      'stock below zero is worth nothing',
    );

    assert.deepEqual(october.totals, {
      itemCount: 3,
      opening: 15,
      purchased: 4,
      sold: 6,
      adjusted: -1,
      closing: 12,
      stockValue: 9000,
    });
    assert.equal(october.total, 3);
  });

  it('moves with the period: opening of one day is the closing of the day before', async () => {
    const september = await report('from=2026-09-01&to=2026-09-30');
    const november = await report('from=2026-11-01&to=2026-11-30');
    const shirtOf = (r: Report) => r.items.find((row) => row.sku === shirt.sku);
    assert.equal(shirtOf(september)?.closing, 10);
    assert.equal(shirtOf(november)?.opening, 10);
    assert.equal(shirtOf(november)?.sold, 1);
    assert.equal(shirtOf(november)?.closing, 9);

    // Before anything was received: nothing to show unless every item is asked for.
    const august = await report('from=2026-08-01&to=2026-08-31');
    assert.equal(august.total, 0);
    assert.equal(august.totals.closing, 0);
    const augustAll = await report('from=2026-08-01&to=2026-08-31&stock=all&pageSize=100');
    assert.ok(augustAll.total > 3, 'every item, also those that never had stock');
    assert.ok(augustAll.items.every((row) => row.closing === 0 && row.opening === 0));
  });

  it('filters by brand, size, colour, search and stock', async () => {
    const urbanWeave = await idByName(api, 'brands', 'Urban Weave');
    const byBrand = await report(`${OCTOBER}&brandId=${urbanWeave}`);
    assert.deepEqual(
      byBrand.items.map((row) => row.sku),
      [shirt.sku],
    );
    assert.equal(byBrand.totals.closing, 10);

    const mustard = await idByName(api, 'colors', 'Mustard');
    const byColour = await report(`${OCTOBER}&colorId=${mustard}`);
    assert.deepEqual(
      byColour.items.map((row) => row.sku),
      [kurti.sku],
    );

    const sizeS = await idByName(api, 'sizes', 'S');
    const bySizeAll = await report(`${OCTOBER}&sizeId=${sizeS}&stock=all&pageSize=100`);
    assert.ok(bySizeAll.items.length >= 1);
    assert.ok(bySizeAll.items.every((row) => row.sizeName === 'S'));

    const search = await report(`${OCTOBER}&search=${encodeURIComponent('stole')}`);
    assert.deepEqual(
      search.items.map((row) => row.sku),
      [stole.sku],
    );

    const inStock = await report(`${OCTOBER}&stock=in`);
    assert.deepEqual(inStock.items.map((row) => row.sku).sort(), [kurti.sku, shirt.sku].sort());
    const negative = await report(`${OCTOBER}&stock=negative`);
    assert.deepEqual(
      negative.items.map((row) => row.sku),
      [stole.sku],
    );
    const out = await report(`${OCTOBER}&stock=out&pageSize=100`);
    assert.ok(out.items.some((row) => row.sku === stole.sku));
    assert.ok(out.items.every((row) => row.closing <= 0));
  });

  it('sorts and pages, with totals over every page', async () => {
    const byClosing = await report(`${OCTOBER}&sortBy=closing&sortOrder=desc`);
    assert.deepEqual(
      byClosing.items.map((row) => row.closing),
      [10, 4, -2],
    );
    const page2 = await report(`${OCTOBER}&pageSize=1&page=2`);
    assert.equal(page2.items.length, 1);
    assert.equal(page2.items[0]?.sku, kurti.sku);
    assert.equal(page2.total, 3);
    assert.equal(page2.totalPages, 3);
    assert.equal(page2.totals.closing, 12, 'totals are for every matching item');
  });

  it('exports every matching row in one go', async () => {
    const res = await api.get<ExportReport>(`/reports/stock/export?${OCTOBER}&pageSize=1`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const all = res.body.data;
    assert.equal(all.items.length, 3, 'paging is ignored');
    assert.equal(all.truncated, false);
    assert.equal(all.totals.stockValue, 9000);
    assert.deepEqual(
      all.items.map((row) => row.sku),
      [shirt.sku, kurti.sku, stole.sku],
    );
  });

  it('validates the query', async () => {
    const reversed = await api.get('/reports/stock?from=2026-10-31&to=2026-10-01');
    assert.equal(reversed.status, 400);
    assert.equal(reversed.body.error.field, 'to');
    assert.equal((await api.get('/reports/stock')).status, 400);
    assert.equal((await api.get(`/reports/stock?${OCTOBER}&stock=plenty`)).status, 400);
    assert.equal((await api.get(`/reports/stock?${OCTOBER}&brandId=nope`)).status, 400);
    assert.equal((await api.get(`/reports/stock?${OCTOBER}&sortBy=price`)).status, 400);
    assert.equal((await api.get('/reports/stock/export?from=2026-10-01')).status, 400);
  });

  it('is for administrators only', async () => {
    const created = await api.post<{ temporaryPassword: string }>('/users', {
      username: 'stockstaff',
      fullName: 'Counter Staff',
      role: 'staff',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const staff = await api.newClient();
    await staff.login('stockstaff', created.body.data.temporaryPassword);
    await staff.post('/auth/change-password', {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: 'Stock#2026x',
    });
    assert.equal((await staff.get(`/reports/stock?${OCTOBER}`)).status, 403);
    assert.equal((await staff.get(`/reports/stock/export?${OCTOBER}`)).status, 403);
    assert.equal((await (await api.newClient()).get(`/reports/stock?${OCTOBER}`)).status, 401);
  });
});

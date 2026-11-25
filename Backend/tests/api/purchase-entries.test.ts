// Must be the FIRST import of every test file: env.ts reads NODE_ENV when it loads, and in
// test mode the API connects to "<DB_NAME>_test" instead of the development database.
import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { financialYearStart } from '../../src/modules/purchase-orders/po-number.js';
import { type TestApi, idByName, startApi } from '../helpers/harness.js';

interface Item {
  productId: string;
  variantId: string | null;
  productName: string;
  productType: string;
  sku: string;
  barcode: string;
  mrp: number;
  unitPrice: number;
  purchasePrice: number | null;
  gstRate: number;
}
interface ReceivableOrder {
  id: string;
  poNo: string;
  status: string;
  supplierId: string;
  items: (Item & {
    lineNo: number;
    orderedQuantity: number;
    receivedQuantity: number;
    rate: number;
    discountPercent: number;
  })[];
}
interface PeLine {
  lineNo: number;
  sku: string;
  quantity: number;
  rate: number;
  lineTotal: number;
  mrp: number;
  sellingPrice: number;
  orderedQuantity: number | null;
}
interface Pe {
  id: string;
  peNo: string;
  entryDate: string;
  supplierName: string;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  purchaseOrderId: string | null;
  poNo: string | null;
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
  billAmount: number | null;
  status: string;
  cancelledAt: string | null;
  createdByName: string;
  updatedByName: string;
  items: PeLine[];
}
interface Po {
  id: string;
  status: string;
  items: { sku: string; quantity: number; receivedQuantity: number }[];
}
interface Paged<T> {
  items: T[];
  total: number;
}

let api: TestApi;
/** Today in the shop's time zone, like the server. */
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const fy = financialYearStart(today);
const peNo = (n: number) => `PE-${fy}-${String(n).padStart(5, '0')}`;

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

async function one(code: string): Promise<Item> {
  const res = await api.get<Item[]>(
    `/purchase-orders/items/lookup?code=${encodeURIComponent(code)}`,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [item] = res.body.data;
  assert.ok(item, `no item for ${code}`);
  return item;
}

async function po(id: string): Promise<Po> {
  const res = await api.get<Po>(`/purchase-orders/${id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

const received = (order: Po) =>
  order.items.map((item) => [item.sku, item.quantity, item.receivedQuantity]);

const line = (
  item: Pick<Item, 'productId' | 'variantId'>,
  quantity: number,
  rate: number,
  extra: { discountPercent?: number; mrp?: number | null; sellingPrice?: number | null } = {},
) => ({
  productId: item.productId,
  variantId: item.variantId,
  quantity,
  rate,
  discountPercent: extra.discountPercent ?? 0,
  mrp: extra.mrp ?? null,
  sellingPrice: extra.sellingPrice ?? null,
});

describe('purchase entries', () => {
  let order: ReceivableOrder;
  let shirt: Item;
  let kurti: ReceivableOrder['items'][number];
  let stole: Item;
  let first: Pe;
  let second: Pe;
  let direct: Pe;

  it('previews the next number', async () => {
    const next = await api.get<{ peNo: string }>('/purchase-entries/next-number');
    assert.equal(next.status, 200);
    assert.equal(next.body.data.peNo, peNo(1));
    const lastYear = await api.get<{ peNo: string }>(
      `/purchase-entries/next-number?date=${fy - 1}-06-01`,
    );
    assert.equal(lastYear.body.data.peNo, `PE-${fy - 1}-00001`);
  });

  it("lists a supplier's POs to receive, with the items as they are now", async () => {
    shirt = await one('8901234510011');
    const kurtiItem = await one('KRT-3001');
    const created = await api.post<{ id: string; poNo: string }>('/purchase-orders', {
      supplierId: tiruppur,
      poDate: today,
      items: [
        { productId: shirt.productId, variantId: shirt.variantId, quantity: 10, rate: 720 },
        {
          productId: kurtiItem.productId,
          variantId: kurtiItem.variantId,
          quantity: 5,
          rate: 450,
          discountPercent: 10,
        },
      ],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const list = await api.get<{ id: string; status: string }[]>(
      `/purchase-entries/orders?supplierId=${tiruppur}`,
    );
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.deepEqual(
      list.body.data.map((row) => [row.id, row.status]),
      [[created.body.data.id, 'open']],
    );
    const none = await api.get<unknown[]>(`/purchase-entries/orders?supplierId=${mumbai}`);
    assert.deepEqual(none.body.data, []);
    // Without a supplier: every open / partly received PO.
    const everyone = await api.get<{ id: string; supplierName: string }[]>(
      '/purchase-entries/orders',
    );
    assert.equal(everyone.status, 200, JSON.stringify(everyone.body));
    assert.deepEqual(
      everyone.body.data.map((row) => [row.id, row.supplierName]),
      [[created.body.data.id, 'Tiruppur Knit Exports']],
    );
    assert.equal((await api.get('/purchase-entries/orders?supplierId=x')).status, 400);

    const detail = await api.get<ReceivableOrder>(
      `/purchase-entries/orders/${created.body.data.id}`,
    );
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    order = detail.body.data;
    assert.equal(order.poNo, created.body.data.poNo);
    assert.equal(order.supplierId, tiruppur);
    const [shirtLine, kurtiLine] = order.items;
    assert.ok(shirtLine && kurtiLine);
    kurti = kurtiLine;
    assert.equal(shirtLine.sku, shirt.sku);
    assert.equal(shirtLine.orderedQuantity, 10);
    assert.equal(shirtLine.receivedQuantity, 0);
    assert.equal(shirtLine.rate, 720);
    assert.equal(shirtLine.mrp, 1499);
    assert.equal(shirtLine.unitPrice, 1299);
    assert.equal(shirtLine.purchasePrice, 720);
    assert.equal(kurtiLine.discountPercent, 10);
    assert.equal((await api.get(`/purchase-entries/orders/${crypto.randomUUID()}`)).status, 404);
  });

  it('receives part of a PO and sets the new item prices', async () => {
    const res = await api.post<Pe>('/purchase-entries', {
      supplierId: tiruppur,
      purchaseOrderId: order.id,
      supplierInvoiceNo: '  TKE/1042 ',
      supplierInvoiceDate: today,
      entryDate: today,
      billAmount: 6662,
      notes: ' 2 cartons ',
      items: [
        line(shirt, 6, 720, { mrp: 1599, sellingPrice: 1399 }),
        line(kurti, 5, 450, { discountPercent: 10 }),
      ],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    first = res.body.data;
    assert.equal(first.peNo, peNo(1));
    assert.equal(first.status, 'posted');
    assert.equal(first.supplierName, 'Tiruppur Knit Exports');
    assert.equal(first.supplierInvoiceNo, 'TKE/1042');
    assert.equal(first.poNo, order.poNo);
    assert.equal(first.purchaseOrderId, order.id);
    assert.equal(first.supplyType, 'intra');
    assert.equal(first.notes, '2 cartons');
    assert.equal(first.billAmount, 6662);
    assert.equal(first.createdByName, 'Shop Admin');
    // Shirt: 4,320 + 5% = 4,536. Kurti: 2,250 − 10% = 2,025 + 5% (50.63 × 2) = 2,126.26.
    assert.equal(first.itemCount, 2);
    assert.equal(first.totalQuantity, 11);
    assert.equal(first.grossAmount, 6570);
    assert.equal(first.discountTotal, 225);
    assert.equal(first.taxableTotal, 6345);
    assert.equal(first.cgstTotal, 158.63);
    assert.equal(first.sgstTotal, 158.63);
    assert.equal(first.igstTotal, 0);
    assert.equal(first.roundOff, -0.26);
    assert.equal(first.grandTotal, 6662);
    assert.deepEqual(
      first.items.map((item) => [
        item.lineNo,
        item.sku,
        item.quantity,
        item.lineTotal,
        item.mrp,
        item.sellingPrice,
        item.orderedQuantity,
      ]),
      [
        [1, shirt.sku, 6, 4536, 1599, 1399, 10],
        [2, kurti.sku, 5, 2126.26, kurti.mrp, kurti.unitPrice, 5],
      ],
    );

    // The PO is partly received.
    const after = await po(order.id);
    assert.equal(after.status, 'partial');
    assert.deepEqual(received(after), [
      [shirt.sku, 10, 6],
      [kurti.sku, 5, 5],
    ]);

    // Only the received variant got the new prices (as its own override).
    const shirtNow = await one('8901234510011');
    assert.equal(shirtNow.mrp, 1599);
    assert.equal(shirtNow.unitPrice, 1399);
    assert.equal(shirtNow.purchasePrice, 720);
    const sibling = await one('8901234510028');
    assert.equal(sibling.mrp, 1499);
    assert.equal(sibling.unitPrice, 1299);
    const sale = await api.get<{ unitPrice: number }[]>('/sales/items/lookup?code=8901234510011');
    assert.equal(sale.body.data[0]?.unitPrice, 1399);
  });

  it('receives the rest (and more), completing the PO; products without variants get new prices', async () => {
    stole = await one('ACC-8001');
    assert.equal(stole.variantId, null);
    const res = await api.post<Pe>('/purchase-entries', {
      supplierId: tiruppur,
      purchaseOrderId: order.id,
      supplierInvoiceNo: 'TKE/1077',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [
        line(shirt, 6, 700, { mrp: 1599, sellingPrice: 1399 }),
        line(stole, 2, 230, { mrp: 649, sellingPrice: 549 }),
      ],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    second = res.body.data;
    assert.equal(second.peNo, peNo(2));
    assert.equal(second.billAmount, null);
    assert.deepEqual(
      second.items.map((item) => [item.sku, item.orderedQuantity]),
      [
        [shirt.sku, 10],
        [stole.sku, null],
      ],
    );

    // 12 of 10 shirts and all kurtis: received (more than ordered is allowed).
    const after = await po(order.id);
    assert.equal(after.status, 'received');
    assert.deepEqual(received(after), [
      [shirt.sku, 10, 12],
      [kurti.sku, 5, 5],
    ]);
    const receivable = await api.get<unknown[]>(`/purchase-entries/orders?supplierId=${tiruppur}`);
    assert.deepEqual(receivable.body.data, []);

    assert.equal((await one('8901234510011')).purchasePrice, 700);
    const stoleNow = await one('ACC-8001');
    assert.equal(stoleNow.purchasePrice, 230);
    assert.equal(stoleNow.mrp, 649);
    assert.equal(stoleNow.unitPrice, 549);
  });

  it('records a direct purchase from another state (IGST)', async () => {
    const jeans = await one('JNS-2001');
    const saree = await one('SAR-4001');
    const res = await api.post<Pe>('/purchase-entries', {
      supplierId: mumbai,
      supplierInvoiceNo: 'MDH-88',
      supplierInvoiceDate: `${today.slice(0, 8)}01`,
      entryDate: today,
      billAmount: 4620,
      items: [line(jeans, 4, 1100), line(saree, 2.5, 4200)],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    direct = res.body.data;
    assert.equal(direct.peNo, peNo(3));
    assert.equal(direct.purchaseOrderId, null);
    assert.equal(direct.poNo, null);
    assert.equal(direct.supplyType, 'inter');
    assert.equal(direct.cgstTotal + direct.sgstTotal, 0);
    // Jeans 4,400 + 5% IGST = 4,620; saree 10,500 + 5% = 11,025.
    assert.equal(direct.igstTotal, 745);
    assert.equal(direct.grandTotal, 15645);
    assert.equal(direct.totalQuantity, 6.5);
    assert.ok(direct.items.every((item) => item.orderedQuantity === null));
    // Prices left out stay as they are.
    assert.equal(direct.items[0]?.mrp, jeans.mrp);
    assert.equal(direct.items[0]?.sellingPrice, jeans.unitPrice);
  });

  it('gives label copies by received quantity (one for fabric)', async () => {
    const res = await api.get<(Item & { copies: number })[]>(
      `/purchase-entries/${direct.id}/labels`,
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.data.map((item) => [item.productType, item.copies]),
      [
        ['readymade', 4],
        ['fabric', 1],
      ],
    );
    const shirtLabels = await api.get<(Item & { copies: number })[]>(
      `/purchase-entries/${first.id}/labels`,
    );
    // Current prices and barcode, not the snapshot.
    assert.equal(shirtLabels.body.data[0]?.barcode, '8901234510011');
    assert.equal(shirtLabels.body.data[0]?.unitPrice, 1399);
    assert.equal(shirtLabels.body.data[0]?.copies, 6);
    assert.equal((await api.get(`/purchase-entries/${crypto.randomUUID()}/labels`)).status, 404);
  });

  it('refuses bad input without using up a number', async () => {
    const inactiveItem = await one('TRS-9001');
    const base = {
      supplierId: tiruppur,
      supplierInvoiceNo: 'TKE/2001',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [line(shirt, 1, 720)],
    };
    const otherPo = await api.post<{ id: string }>('/purchase-orders', {
      supplierId: mumbai,
      poDate: today,
      items: [{ productId: shirt.productId, variantId: shirt.variantId, quantity: 1, rate: 700 }],
    });
    assert.equal(otherPo.status, 201);

    const cases: [unknown, number, string, RegExp?][] = [
      [{ ...base, supplierInvoiceNo: 'tke/1042' }, 409, 'supplierInvoiceNo', /already entered as/],
      [{ ...base, supplierInvoiceNo: '  ' }, 400, 'supplierInvoiceNo'],
      [{ ...base, supplierId: ludhiana }, 400, 'supplierId', /inactive supplier/],
      [{ ...base, purchaseOrderId: order.id }, 400, 'purchaseOrderId', /already been received/],
      [
        { ...base, purchaseOrderId: otherPo.body.data.id },
        400,
        'purchaseOrderId',
        /not a purchase order of/,
      ],
      [{ ...base, purchaseOrderId: crypto.randomUUID() }, 400, 'purchaseOrderId', /does not exist/],
      [{ ...base, entryDate: tomorrow, supplierInvoiceDate: today }, 400, 'entryDate', /future/],
      [
        { ...base, supplierInvoiceDate: tomorrow },
        400,
        'supplierInvoiceDate',
        /after the received date/,
      ],
      [
        { ...base, items: [line(inactiveItem, 1, 900)] },
        400,
        'items.0.productId',
        /cannot be received/,
      ],
      [
        { ...base, items: [line(shirt, 1, 720), line(shirt, 1, 720)] },
        400,
        'items.1.productId',
        /lines 1 and 2/,
      ],
      [{ ...base, items: [line(shirt, 1.5, 720)] }, 400, 'items.0.quantity', /whole number/],
      [{ ...base, items: [line(shirt, 1, 0)] }, 400, 'items.0.rate', /purchase rate/],
      [
        { ...base, items: [line(shirt, 1, 720, { mrp: 1000, sellingPrice: 1200 })] },
        400,
        'items.0.sellingPrice',
        /more than the MRP/,
      ],
      // Only the MRP given: checked against the current selling price (1,399).
      [{ ...base, items: [line(shirt, 1, 720, { mrp: 1000 })] }, 400, 'items.0.sellingPrice'],
      [{ ...base, items: [] }, 400, 'items'],
    ];
    for (const [body, status, field, message] of cases) {
      const res = await api.post('/purchase-entries', body);
      assert.equal(res.status, status, `${field}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.field, field);
      if (message) assert.match(res.body.error.message, message);
    }
    const next = await api.get<{ peNo: string }>('/purchase-entries/next-number');
    assert.equal(next.body.data.peNo, peNo(4));
  });

  it('edits an entry and the PO quantities follow', async () => {
    const res = await api.put<Pe>(`/purchase-entries/${second.id}`, {
      supplierId: tiruppur,
      purchaseOrderId: order.id,
      supplierInvoiceNo: 'TKE/1077',
      supplierInvoiceDate: today,
      entryDate: today,
      notes: 'Short by 3',
      items: [
        line(shirt, 3, 700, { mrp: 1599, sellingPrice: 1399 }),
        line(stole, 2, 230, { mrp: 649, sellingPrice: 549 }),
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.peNo, second.peNo);
    assert.equal(res.body.data.notes, 'Short by 3');
    assert.equal(res.body.data.updatedByName, 'Shop Admin');
    const after = await po(order.id);
    assert.equal(after.status, 'partial');
    assert.deepEqual(received(after), [
      [shirt.sku, 10, 9],
      [kurti.sku, 5, 5],
    ]);

    const otherYear = await api.put(`/purchase-entries/${second.id}`, {
      supplierId: tiruppur,
      supplierInvoiceNo: 'TKE/1077',
      supplierInvoiceDate: `${fy - 1}-06-01`,
      entryDate: `${fy - 1}-06-01`,
      items: [line(stole, 2, 230)],
    });
    assert.equal(otherYear.status, 400);
    assert.equal(otherYear.body.error.field, 'entryDate');
    assert.match(otherYear.body.error.message, /financial year/);

    // Taking the entry off the PO gives its quantities back to the PO.
    const unlinked = await api.put<Pe>(`/purchase-entries/${second.id}`, {
      supplierId: tiruppur,
      purchaseOrderId: null,
      supplierInvoiceNo: 'TKE/1077',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [line(shirt, 3, 700, { mrp: 1599, sellingPrice: 1399 })],
    });
    assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));
    assert.equal(unlinked.body.data.poNo, null);
    assert.deepEqual(received(await po(order.id)), [
      [shirt.sku, 10, 6],
      [kurti.sku, 5, 5],
    ]);
    const missing = await api.put(`/purchase-entries/${crypto.randomUUID()}`, {
      supplierId: tiruppur,
      supplierInvoiceNo: 'X',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [line(shirt, 1, 700)],
    });
    assert.equal(missing.status, 404);
  });

  it('cancels entries: the PO goes back to open and can be edited again', async () => {
    const cancelled = await api.post<Pe>(`/purchase-entries/${first.id}/cancel`);
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.status, 'cancelled');
    assert.ok(cancelled.body.data.cancelledAt);
    const after = await po(order.id);
    assert.equal(after.status, 'open');
    assert.deepEqual(received(after), [
      [shirt.sku, 10, 0],
      [kurti.sku, 5, 0],
    ]);
    // Prices set by the entry stay.
    assert.equal((await one('8901234510011')).unitPrice, 1399);

    const again = await api.post(`/purchase-entries/${first.id}/cancel`);
    assert.equal(again.status, 400);
    assert.match(again.body.error.message, /already cancelled/);
    const edit = await api.put(`/purchase-entries/${first.id}`, {
      supplierId: tiruppur,
      supplierInvoiceNo: 'TKE/1042',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [line(shirt, 1, 720)],
    });
    assert.equal(edit.status, 400);
    assert.match(edit.body.error.message, /cancelled/);

    const poEdit = await api.put(`/purchase-orders/${order.id}`, {
      supplierId: tiruppur,
      poDate: today,
      items: [{ productId: shirt.productId, variantId: shirt.variantId, quantity: 8, rate: 720 }],
    });
    assert.equal(poEdit.status, 200, JSON.stringify(poEdit.body));

    // A cancelled entry's invoice can be entered again.
    const reentered = await api.post<Pe>('/purchase-entries', {
      supplierId: tiruppur,
      purchaseOrderId: order.id,
      supplierInvoiceNo: 'TKE/1042',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [line(shirt, 8, 720, { mrp: 1599, sellingPrice: 1399 })],
    });
    assert.equal(reentered.status, 201, JSON.stringify(reentered.body));
    assert.equal(reentered.body.data.peNo, peNo(4));
    assert.equal((await po(order.id)).status, 'received');

    // A received PO cannot be edited or cancelled.
    const lockedEdit = await api.put(`/purchase-orders/${order.id}`, {
      supplierId: tiruppur,
      poDate: today,
      items: [{ productId: shirt.productId, variantId: shirt.variantId, quantity: 9, rate: 720 }],
    });
    assert.equal(lockedEdit.status, 400);
  });

  it('lists, searches and filters entries (newest first)', async () => {
    const all = await api.get<Paged<{ peNo: string; status: string }>>(
      '/purchase-entries?pageSize=50',
    );
    assert.equal(all.status, 200);
    assert.equal(all.body.data.total, 4);
    assert.equal(all.body.data.items[0]?.peNo, peNo(4));

    const count = async (query: string) =>
      (await api.get<Paged<unknown>>(`/purchase-entries?${query}`)).body.data.total;
    assert.equal(await count('search=mdh-88'), 1);
    assert.equal(await count('search=mumbai'), 1);
    assert.equal(await count(`search=${order.poNo}`), 2);
    assert.equal(await count(`search=${peNo(2)}`), 1);
    assert.equal(await count('status=cancelled'), 1);
    assert.equal(await count('status=posted'), 3);
    assert.equal(await count(`supplierId=${tiruppur}`), 3);
    assert.equal(await count(`purchaseOrderId=${order.id}`), 2);
    assert.equal(await count(`from=${today}&to=${today}`), 4);
    assert.equal(await count('from=2001-01-01&to=2001-12-31'), 0);
    assert.equal((await api.get('/purchase-entries?from=2026-12-31&to=2026-01-01')).status, 400);
    assert.equal((await api.get(`/purchase-entries/${crypto.randomUUID()}`)).status, 404);
  });

  it('protects suppliers and products on entries from deletion', async () => {
    const jaipur = await idByName(api, 'suppliers', 'Jaipur Prints & Co.');
    const kidsItem = await one('KID-5001');
    const res = await api.post('/purchase-entries', {
      supplierId: jaipur,
      supplierInvoiceNo: 'JBP-1',
      supplierInvoiceDate: today,
      entryDate: today,
      items: [line(kidsItem, 1, 560)],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const supplier = await api.delete(`/suppliers/${jaipur}`);
    assert.equal(supplier.status, 409);
    assert.equal(supplier.body.error.code, 'IN_USE');
    assert.match(supplier.body.error.message, /purchase entries/);
    const product = await api.delete(`/products/${kidsItem.productId}`);
    assert.equal(product.status, 409);
    assert.match(product.body.error.message, /purchase entries/);
  });

  it('is for administrators only', async () => {
    const created = await api.post<{ temporaryPassword: string }>('/users', {
      username: 'pestaff',
      fullName: 'Counter Staff',
      role: 'staff',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const staff = await api.newClient();
    await staff.login('pestaff', created.body.data.temporaryPassword);
    await staff.post('/auth/change-password', {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: 'Purchase#2026x',
    });
    assert.equal((await staff.get('/purchase-entries')).status, 403);
    assert.equal((await staff.get(`/purchase-entries/orders?supplierId=${tiruppur}`)).status, 403);
    assert.equal((await (await api.newClient()).get('/purchase-entries')).status, 401);
  });
});

// Must be the FIRST import of every test file: env.ts reads NODE_ENV when it loads, and in
// test mode the API connects to "<DB_NAME>_test" instead of the development database.
import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type TestApi, type TestClient, startApi } from '../helpers/harness.js';

interface Item {
  productId: string;
  variantId: string | null;
  productName: string;
  productType: string;
  designNo: string;
  sizeName: string;
  colorName: string;
  sku: string;
  barcode: string;
  gstRate: number;
  mrp: number;
  unitPrice: number;
  status: string;
}
interface Invoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  seller: { shopName: string; state: string; gstNumber: string };
  customerId: string | null;
  customerName: string;
  customerMobile: string;
  supplyType: string;
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
  amountReceived: number;
  changeReturned: number;
  createdByName: string;
  items: {
    lineNo: number;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    sizeName: string;
    colorName: string;
  }[];
  payments: { mode: string; amount: number; reference: string }[];
}
interface Paged<T> {
  items: T[];
  total: number;
}

let api: TestApi;

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
});

async function lookup(code: string): Promise<Item[]> {
  const res = await api.get<Item[]>(`/sales/items/lookup?code=${encodeURIComponent(code)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

async function one(code: string): Promise<Item> {
  const [item, ...rest] = await lookup(code);
  assert.ok(item, `no item for ${code}`);
  assert.equal(rest.length, 0, `${code} should match one item`);
  return item;
}

function line(item: Item, quantity = 1, discountPercent = 0) {
  return {
    productId: item.productId,
    variantId: item.variantId,
    quantity,
    discountPercent,
    unitPrice: item.unitPrice,
  };
}

const cash = (amount: number) => [{ mode: 'cash', amount }];

async function createStaffClient(username: string): Promise<TestClient> {
  const created = await api.post<{ temporaryPassword: string }>('/users', {
    username,
    fullName: 'Counter Staff',
    role: 'staff',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const client = await api.newClient();
  await client.login(username, created.body.data.temporaryPassword);
  const changed = await client.post('/auth/change-password', {
    currentPassword: created.body.data.temporaryPassword,
    newPassword: 'Billing#2026x',
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  return client;
}

describe('shop profile', () => {
  it('starts empty, is saved by an admin and is read-only for staff', async () => {
    const empty = await api.get<{ shopName: string }>('/settings/shop');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.shopName, '');

    const saved = await api.put<{ shopName: string; phone: string; gstNumber: string }>(
      '/settings/shop',
      {
        shopName: '  Kachi   Fashions ',
        phone: '+91 98765 43210',
        email: 'Shop@Example.com',
        gstNumber: '33abcpt7712m1zd',
        address: '12 Main Road',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001',
      },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.shopName, 'Kachi Fashions');
    assert.equal(saved.body.data.phone, '9876543210');
    assert.equal(saved.body.data.gstNumber, '33ABCPT7712M1ZD');

    const mismatch = await api.put('/settings/shop', {
      shopName: 'Kachi Fashions',
      gstNumber: '33ABCPT7712M1ZD',
      state: 'Kerala',
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.error.field, 'gstNumber');

    const staff = await createStaffClient('counter1');
    assert.equal((await staff.get('/settings/shop')).status, 200);
    const denied = await staff.put('/settings/shop', { shopName: 'Hacked' });
    assert.equal(denied.status, 403);
  });

  it('keeps a logo that an admin uploads, replaces and removes', async () => {
    // 1×1 PNG.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const none = await api.get<{ logo: string }>('/settings/shop/logo');
    assert.equal(none.status, 200);
    assert.equal(none.body.data.logo, '');

    const saved = await api.put<{ logo: string }>('/settings/shop/logo', { logo: png });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.logo, png);
    assert.equal((await api.get<{ logo: string }>('/settings/shop/logo')).body.data.logo, png);

    // The profile (snapshotted on every bill) does not carry the logo, and saving it keeps the logo.
    const profile = await api.get<Record<string, unknown>>('/settings/shop');
    assert.equal('logo' in profile.body.data, false);
    await api.put('/settings/shop', { shopName: 'Kachi Fashions', state: 'Tamil Nadu' });
    assert.equal((await api.get<{ logo: string }>('/settings/shop/logo')).body.data.logo, png);

    const rejected = [
      'data:image/svg+xml;base64,PHN2Zy8+',
      png.replace('image/png', 'image/jpeg'), // PNG bytes declared as JPEG
      'data:image/png;base64,bm90IGFuIGltYWdl', // "not an image"
      `data:image/png;base64,${Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(300 * 1024),
      ]).toString('base64')}`, // over 256 KB
      '',
    ];
    for (const logo of rejected) {
      const response = await api.put('/settings/shop/logo', { logo });
      assert.equal(response.status, 400, logo.slice(0, 40));
      assert.equal(response.body.error.field, 'logo');
    }

    const staff = await createStaffClient('counter3');
    assert.equal((await staff.get<{ logo: string }>('/settings/shop/logo')).body.data.logo, png);
    assert.equal((await staff.put('/settings/shop/logo', { logo: png })).status, 403);
    assert.equal((await staff.delete('/settings/shop/logo')).status, 403);

    assert.equal((await api.delete('/settings/shop/logo')).status, 204);
    assert.equal((await api.get<{ logo: string }>('/settings/shop/logo')).body.data.logo, '');
  });

  it('keeps the colour theme an admin picks, and anyone can read it before signing in', async () => {
    const theme = () => api.get<{ color: string }>('/settings/shop/theme');
    assert.equal((await theme()).body.data.color, '');

    const saved = await api.put<{ color: string }>('/settings/shop/theme', { color: ' b71c1c ' });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.color, '#B71C1C');
    assert.equal((await theme()).body.data.color, '#B71C1C');

    // Not part of the profile that bills copy, and saving the profile keeps it.
    const profile = await api.get<Record<string, unknown>>('/settings/shop');
    assert.equal('color' in profile.body.data, false);
    await api.put('/settings/shop', { shopName: 'Kachi Fashions', state: 'Tamil Nadu' });
    assert.equal((await theme()).body.data.color, '#B71C1C');

    for (const color of ['red', '#B71C1', '#B71C1C0', 'rgb(1,2,3)', 42]) {
      const response = await api.put('/settings/shop/theme', { color });
      assert.equal(response.status, 400, String(color));
      assert.equal(response.body.error.field, 'color');
    }

    // The sign-in page reads it without a session; changing it needs an administrator.
    const guest = await api.newClient();
    assert.equal(
      (await guest.get<{ color: string }>('/settings/shop/theme')).body.data.color,
      '#B71C1C',
    );
    assert.equal((await guest.put('/settings/shop/theme', { color: '#000000' })).status, 401);
    const staff = await createStaffClient('counter4');
    assert.equal((await staff.put('/settings/shop/theme', { color: '#000000' })).status, 403);

    const reset = await api.put<{ color: string }>('/settings/shop/theme', { color: '' });
    assert.equal(reset.body.data.color, '');
    assert.equal((await theme()).body.data.color, '');
  });
});

describe('item lookup (scanner)', () => {
  it('finds a variant by barcode with its resolved price', async () => {
    const item = await one('8901234510011');
    assert.equal(item.sku, 'MSH-1001-101-BLK-M');
    assert.equal(item.productName, "Men's Cotton Casual Shirt");
    assert.equal(item.sizeName, 'M');
    assert.equal(item.colorName, 'Black');
    assert.equal(item.unitPrice, 1299);
    assert.equal(item.mrp, 1499);
    assert.equal(item.status, 'active');

    const override = await one('8901234510059');
    assert.equal(override.unitPrice, 1349);
    assert.equal(override.mrp, 1599);
  });

  it('matches SKUs case-insensitively', async () => {
    const item = await one('msh-1001-101-blk-m');
    assert.equal(item.barcode, '8901234510011');
  });

  it('finds a product sold without variants by its barcode', async () => {
    const item = await one('8909876500017');
    assert.equal(item.productName, 'Silk Blend Stole');
    assert.equal(item.variantId, null);
    assert.equal(item.sku, 'ACC-8001');
    assert.equal(item.unitPrice, 499);
  });

  it('returns every variant for a product code', async () => {
    const items = await lookup('KRT-3001');
    assert.equal(items.length, 8);
    assert.ok(items.every((item) => item.variantId));
  });

  it('returns nothing for unknown codes and flags inactive products', async () => {
    assert.deepEqual(await lookup('0000000000'), []);
    const inactive = await lookup('TRS-9001');
    assert.ok(inactive.length > 0);
    assert.ok(inactive.every((item) => item.status === 'inactive'));
  });
});

describe('item search (typed text)', () => {
  it('matches every word across name, size and colour', async () => {
    const res = await api.get<Item[]>('/sales/items?search=kurti%20mustard');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 4);
    assert.ok(res.body.data.every((item) => item.colorName === 'Mustard'));
  });

  it('skips inactive products and honours the limit', async () => {
    const inactive = await api.get<Item[]>('/sales/items?search=linen');
    assert.deepEqual(inactive.body.data, []);
    const limited = await api.get<Item[]>('/sales/items?search=a&limit=3');
    assert.equal(limited.body.data.length, 3);
  });

  it('requires search text', async () => {
    assert.equal((await api.get('/sales/items?search=')).status, 400);
  });
});

describe('saving bills', () => {
  let firstBill: Invoice;

  it('saves a walk-in bill with server-computed GST, totals and change', async () => {
    const shirt = await one('8901234510011');
    const stole = await one('8909876500017');
    const res = await api.post<Invoice>('/sales/invoices', {
      items: [line(shirt, 2), line(stole, 1, 10)],
      payments: cash(3500),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const bill = res.body.data;
    firstBill = bill;

    assert.match(bill.invoiceNo, /^INV\/\d{2}-\d{2}\/00001$/);
    assert.match(bill.invoiceDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(bill.customerId, null);
    assert.equal(bill.supplyType, 'intra');
    assert.equal(bill.seller.shopName, 'Kachi Fashions');
    assert.equal(bill.itemCount, 2);
    assert.equal(bill.totalQuantity, 3);
    assert.equal(bill.grossAmount, 3097); // 1299 × 2 + 499
    assert.equal(bill.discountTotal, 49.9);
    assert.equal(bill.grandTotal, 3047); // 3047.10 rounded
    assert.equal(bill.roundOff, -0.1);
    assert.equal(
      Math.round((bill.taxableTotal + bill.cgstTotal + bill.sgstTotal) * 100),
      304710,
      'taxable + tax = amount before round-off',
    );
    assert.equal(bill.igstTotal, 0);
    assert.equal(bill.amountReceived, 3500);
    assert.equal(bill.changeReturned, 453);
    assert.equal(bill.createdByName, 'Shop Admin');

    assert.deepEqual(
      bill.items.map((item) => [item.lineNo, item.sku, item.quantity, item.lineTotal]),
      [
        [1, 'MSH-1001-101-BLK-M', 2, 2598],
        [2, 'ACC-8001', 1, 449.1],
      ],
    );
    assert.deepEqual(bill.payments, [{ mode: 'cash', amount: 3500, reference: '' }]);

    const fetched = await api.get<Invoice>(`/sales/invoices/${bill.id}`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body.data.items, bill.items);
  });

  it('numbers bills without gaps, even after a refused save', async () => {
    const shirt = await one('8901234510011');
    const changed = await api.post('/sales/invoices', {
      items: [{ ...line(shirt), unitPrice: 999 }],
      payments: cash(2000),
    });
    assert.equal(changed.status, 400);
    assert.equal(changed.body.error.field, 'items.0.unitPrice');
    assert.match(changed.body.error.message, /has changed to ₹1,299\.00/);

    const next = await api.post<Invoice>('/sales/invoices', {
      items: [line(shirt)],
      payments: [{ mode: 'upi', amount: 1299, reference: 'UPI-12345' }],
    });
    assert.equal(next.status, 201, JSON.stringify(next.body));
    assert.equal(next.body.data.invoiceNo, firstBill.invoiceNo.replace(/00001$/, '00002'));
    assert.equal(next.body.data.changeReturned, 0);
    assert.equal(next.body.data.payments[0]?.reference, 'UPI-12345');
  });

  it('accepts split payments and staff users', async () => {
    const staff = await createStaffClient('counter2');
    const kurti = (await lookup('KRT-3001'))[0];
    assert.ok(kurti);
    const res = await staff.post<Invoice>('/sales/invoices', {
      items: [line(kurti, 2)],
      payments: [
        { mode: 'card', amount: 1000 },
        { mode: 'cash', amount: 700 },
      ],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.grandTotal, 1698);
    assert.equal(res.body.data.changeReturned, 2);
    assert.equal(res.body.data.createdByName, 'Counter Staff');
  });

  it('allows decimal quantities only for fabric', async () => {
    const shirt = await one('8901234510011');
    const decimal = await api.post('/sales/invoices', {
      items: [line(shirt, 1.5)],
      payments: cash(5000),
    });
    assert.equal(decimal.status, 400);
    assert.equal(decimal.body.error.field, 'items.0.quantity');

    const saree = (await lookup('SAR-4001'))[0];
    assert.ok(saree && saree.productType === 'fabric');
    const fabric = await api.post<Invoice>('/sales/invoices', {
      items: [line(saree, 1.5)],
      payments: cash(10_499),
    });
    assert.equal(fabric.status, 201, JSON.stringify(fabric.body));
    assert.equal(fabric.body.data.totalQuantity, 1.5);
    assert.equal(fabric.body.data.grandTotal, 10_499); // 6999 × 1.5 = 10498.50 → 10499
  });

  it('refuses inactive items, missing variants and short payments', async () => {
    const inactive = (await lookup('TRS-9001'))[0];
    assert.ok(inactive);
    const res1 = await api.post('/sales/invoices', {
      items: [line(inactive)],
      payments: cash(5000),
    });
    assert.equal(res1.status, 400);
    assert.match(res1.body.error.message, /inactive/);

    const kurti = (await lookup('KRT-3001'))[0];
    assert.ok(kurti);
    const res2 = await api.post('/sales/invoices', {
      items: [{ ...line(kurti), variantId: null }],
      payments: cash(5000),
    });
    assert.equal(res2.status, 400);
    assert.equal(res2.body.error.field, 'items.0.variantId');

    const res3 = await api.post('/sales/invoices', { items: [line(kurti)], payments: cash(800) });
    assert.equal(res3.status, 400);
    assert.equal(res3.body.error.field, 'payments');
    assert.match(res3.body.error.message, /short by ₹49\.00/);

    const res4 = await api.post('/sales/invoices', { items: [], payments: [] });
    assert.equal(res4.status, 400);
    assert.equal(res4.body.error.field, 'items');
  });

  it('stores the customer and uses IGST for another state', async () => {
    const customers = await api.get<Paged<{ id: string; name: string; mobile: string }>>(
      '/customers?search=9876543210',
    );
    const priya = customers.body.data.items[0];
    assert.ok(priya);
    const kurti = (await lookup('KRT-3001'))[0];
    assert.ok(kurti);

    const local = await api.post<Invoice>('/sales/invoices', {
      customerId: priya.id,
      items: [line(kurti)],
      payments: cash(849),
    });
    assert.equal(local.status, 201, JSON.stringify(local.body));
    assert.equal(local.body.data.customerName, 'Priya Ramesh');
    assert.equal(local.body.data.customerMobile, '9876543210');
    assert.equal(local.body.data.supplyType, 'intra');

    const outside = await api.post<{ id: string }>('/customers', {
      name: 'Mumbai Traders',
      mobile: '9123456780',
      state: 'Maharashtra',
      gstNumber: '27AAPFU0939F1ZV',
    });
    assert.equal(outside.status, 201, JSON.stringify(outside.body));
    const inter = await api.post<Invoice>('/sales/invoices', {
      customerId: outside.body.data.id,
      items: [line(kurti)],
      payments: cash(849),
    });
    assert.equal(inter.status, 201, JSON.stringify(inter.body));
    assert.equal(inter.body.data.supplyType, 'inter');
    assert.equal(inter.body.data.cgstTotal + inter.body.data.sgstTotal, 0);
    assert.equal(inter.body.data.igstTotal, 40.43);

    const inactive = await api.get<Paged<{ id: string }>>('/customers?search=9447012345');
    const divya = inactive.body.data.items[0];
    assert.ok(divya);
    const refused = await api.post('/sales/invoices', {
      customerId: divya.id,
      items: [line(kurti)],
      payments: cash(849),
    });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.field, 'customerId');
  });

  it("lists today's bills newest first and searches them", async () => {
    const today = firstBill.invoiceDate;
    const res = await api.get<Paged<{ invoiceNo: string; paymentModes: string[] }>>(
      `/sales/invoices?date=${today}&pageSize=50`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 6);
    assert.match(res.body.data.items[0]?.invoiceNo ?? '', /00006$/);
    assert.deepEqual(
      res.body.data.items.find((bill) => bill.invoiceNo.endsWith('00003'))?.paymentModes,
      ['card', 'cash'],
    );

    const search = await api.get<Paged<unknown>>('/sales/invoices?search=priya');
    assert.equal(search.body.data.total, 1);

    const otherDay = await api.get<Paged<unknown>>('/sales/invoices?date=2001-01-01');
    assert.equal(otherDay.body.data.total, 0);
    assert.equal((await api.get(`/sales/invoices/${crypto.randomUUID()}`)).status, 404);
  });

  it('keeps old bills unchanged when the shop profile changes', async () => {
    await api.put('/settings/shop', { shopName: 'Renamed Shop', state: 'Tamil Nadu' });
    const old = await api.get<Invoice>(`/sales/invoices/${firstBill.id}`);
    assert.equal(old.body.data.seller.shopName, 'Kachi Fashions');
  });

  it('protects billed products, variants and customers from deletion', async () => {
    const stole = await one('8909876500017');
    const deleteProduct = await api.delete(`/products/${stole.productId}`);
    assert.equal(deleteProduct.status, 409);
    assert.equal(deleteProduct.body.error.code, 'IN_USE');

    const shirt = await one('8901234510011');
    const product = await api.get<{ variants: { id: string }[] } & Record<string, unknown>>(
      `/products/${shirt.productId}`,
    );
    const { variants, ...rest } = product.body.data;
    const withoutBilled = await api.put(`/products/${shirt.productId}`, {
      ...rest,
      variants: variants.filter((variant) => variant.id !== shirt.variantId),
    });
    assert.equal(withoutBilled.status, 409);
    assert.equal(withoutBilled.body.error.code, 'IN_USE');

    const customers = await api.get<Paged<{ id: string }>>('/customers?search=9876543210');
    const deleteCustomer = await api.delete(`/customers/${customers.body.data.items[0]?.id}`);
    assert.equal(deleteCustomer.status, 409);
    assert.match(deleteCustomer.body.error.message, /has bills/);
  });
});

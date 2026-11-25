// Must be the FIRST import of every test file: env.ts reads NODE_ENV when it loads, and in
// test mode the API connects to "<DB_NAME>_test" instead of the development database.
import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool } from '../../src/config/database.js';
import { type TestApi, startApi } from '../helpers/harness.js';

interface Item {
  productId: string;
  variantId: string | null;
  unitPrice: number;
}
interface Totals {
  billCount: number;
  quantity: number;
  grossAmount: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  gstTotal: number;
  roundOff: number;
  netSales: number;
  averageBill: number;
  cash: number;
  upi: number;
  card: number;
}
interface Report {
  from: string;
  to: string;
  totals: Totals;
  days: (Totals & { date: string })[];
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

const paise = (rupees: number) => Math.round(rupees * 100);

async function item(code: string): Promise<Item> {
  const res = await api.get<Item[]>(`/sales/items/lookup?code=${encodeURIComponent(code)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [first] = res.body.data;
  assert.ok(first, `no item for ${code}`);
  return first;
}

const line = (it: Item, quantity = 1, discountPercent = 0) => ({
  productId: it.productId,
  variantId: it.variantId,
  quantity,
  discountPercent,
  unitPrice: it.unitPrice,
});

/** Saves a bill, then moves it to `date` (bills are always saved with today's date). */
async function billOn(
  date: string,
  items: ReturnType<typeof line>[],
  payments: { mode: string; amount: number }[],
): Promise<{ id: string; grandTotal: number }> {
  const res = await api.post<{ id: string; grandTotal: number }>('/sales/invoices', {
    items,
    payments,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  await pool.query('UPDATE sales_invoices SET invoice_date = $1 WHERE id = $2', [
    date,
    res.body.data.id,
  ]);
  return res.body.data;
}

async function report(from: string, to: string): Promise<Report> {
  const res = await api.get<Report>(`/reports/sales?from=${from}&to=${to}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

describe('sales report', () => {
  before(async () => {
    const shirt = await item('8901234510011'); // ₹1,299
    const stole = await item('8909876500017'); // ₹499
    const kurti = await item('KRT-3001'); // ₹849

    // 5 Oct: ₹3,047 (cash 3,500 − change 453) and ₹1,299 by UPI.
    await billOn(
      '2026-10-05',
      [line(shirt, 2), line(stole, 1, 10)],
      [{ mode: 'cash', amount: 3500 }],
    );
    await billOn('2026-10-05', [line(shirt)], [{ mode: 'upi', amount: 1299 }]);
    // 20 Oct: ₹1,698 split card 1,000 + cash 700 (change 2), and a bill that gets cancelled.
    await billOn(
      '2026-10-20',
      [line(kurti, 2)],
      [
        { mode: 'card', amount: 1000 },
        { mode: 'cash', amount: 700 },
      ],
    );
    const cancelled = await billOn('2026-10-20', [line(shirt)], [{ mode: 'cash', amount: 1299 }]);
    await pool.query(`UPDATE sales_invoices SET status = 'cancelled' WHERE id = $1`, [
      cancelled.id,
    ]);
    // 2 Nov: outside October.
    await billOn('2026-11-02', [line(stole)], [{ mode: 'cash', amount: 499 }]);
  });

  it('sums completed bills day by day, with cash net of change', async () => {
    const october = await report('2026-10-01', '2026-10-31');
    assert.equal(october.from, '2026-10-01');
    assert.equal(october.to, '2026-10-31');
    assert.deepEqual(
      october.days.map((day) => day.date),
      ['2026-10-05', '2026-10-20'],
      'only days with sales, oldest first',
    );

    const [fifth, twentieth] = october.days;
    assert.ok(fifth && twentieth);
    assert.equal(fifth.billCount, 2);
    assert.equal(fifth.quantity, 4);
    assert.equal(fifth.grossAmount, 4396);
    assert.equal(fifth.discountTotal, 49.9);
    assert.equal(fifth.netSales, 4346);
    assert.equal(fifth.averageBill, 2173);
    assert.equal(fifth.cash, 3047);
    assert.equal(fifth.upi, 1299);
    assert.equal(fifth.card, 0);

    assert.equal(twentieth.billCount, 1, 'the cancelled bill is left out');
    assert.equal(twentieth.netSales, 1698);
    assert.equal(twentieth.cash, 698);
    assert.equal(twentieth.card, 1000);

    const { totals } = october;
    assert.equal(totals.billCount, 3);
    assert.equal(totals.quantity, 6);
    assert.equal(totals.netSales, 6044);
    assert.equal(totals.averageBill, 2014.67);
    assert.deepEqual([totals.cash, totals.upi, totals.card], [3745, 1299, 1000]);
    assert.equal(paise(totals.cash + totals.upi + totals.card), paise(totals.netSales));
    assert.equal(
      paise(totals.gstTotal),
      paise(totals.cgstTotal) + paise(totals.sgstTotal) + paise(totals.igstTotal),
    );
    assert.equal(
      paise(totals.taxableTotal) + paise(totals.gstTotal) + paise(totals.roundOff),
      paise(totals.netSales),
      'taxable value + GST + round-off = net sales',
    );
    for (const key of ['billCount', 'grossAmount', 'discountTotal', 'netSales', 'cash'] as const) {
      assert.equal(
        paise(fifth[key] + twentieth[key]),
        paise(totals[key]),
        `${key}: days add up to the total`,
      );
    }
  });

  it('includes both ends of the period', async () => {
    const oneDay = await report('2026-10-20', '2026-10-20');
    assert.equal(oneDay.totals.billCount, 1);
    const across = await report('2026-10-20', '2026-11-02');
    assert.equal(across.totals.billCount, 2);
    assert.equal(across.totals.netSales, 2197);
  });

  it('returns zero totals for a period without bills', async () => {
    const empty = await report('2001-01-01', '2001-01-31');
    assert.deepEqual(empty.days, []);
    assert.equal(empty.totals.billCount, 0);
    assert.equal(empty.totals.netSales, 0);
    assert.equal(empty.totals.averageBill, 0);
    assert.equal(empty.totals.cash, 0);
  });

  it('validates the period', async () => {
    const reversed = await api.get('/reports/sales?from=2026-10-31&to=2026-10-01');
    assert.equal(reversed.status, 400);
    assert.equal(reversed.body.error.field, 'to');

    const tooLong = await api.get('/reports/sales?from=2025-01-01&to=2026-01-02');
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.body.error.message, /at most 366 days/);
    const fullLeapYear = await api.get('/reports/sales?from=2024-01-01&to=2024-12-31');
    assert.equal(fullLeapYear.status, 200);

    assert.equal((await api.get('/reports/sales?from=2026-02-30&to=2026-03-01')).status, 400);
    assert.equal((await api.get('/reports/sales?from=2026-10-01')).status, 400);
    assert.equal((await api.get('/reports/sales')).status, 400);
  });

  it('is for administrators only', async () => {
    const created = await api.post<{ temporaryPassword: string }>('/users', {
      username: 'reportstaff',
      fullName: 'Counter Staff',
      role: 'staff',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const staff = await api.newClient();
    await staff.login('reportstaff', created.body.data.temporaryPassword);
    await staff.post('/auth/change-password', {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: 'Reports#2026x',
    });
    const denied = await staff.get('/reports/sales?from=2026-10-01&to=2026-10-31');
    assert.equal(denied.status, 403);

    const anonymous = await api.newClient();
    const signedOut = await anonymous.get('/reports/sales?from=2026-10-01&to=2026-10-31');
    assert.equal(signedOut.status, 401);
  });
});

describe('bills list by period', () => {
  it('filters by from / to (all statuses, newest first)', async () => {
    const october = await api.get<Paged<{ invoiceDate: string; status: string }>>(
      '/sales/invoices?from=2026-10-01&to=2026-10-31&pageSize=50',
    );
    assert.equal(october.status, 200, JSON.stringify(october.body));
    assert.equal(october.body.data.total, 4);
    assert.ok(october.body.data.items.some((bill) => bill.status === 'cancelled'));
    assert.ok(october.body.data.items.every((bill) => bill.invoiceDate.startsWith('2026-10')));

    const fromOnly = await api.get<Paged<unknown>>('/sales/invoices?from=2026-10-20');
    assert.equal(fromOnly.body.data.total, 3);
    const toOnly = await api.get<Paged<unknown>>('/sales/invoices?to=2026-10-05');
    assert.equal(toOnly.body.data.total, 2);

    const reversed = await api.get('/sales/invoices?from=2026-10-31&to=2026-10-01');
    assert.equal(reversed.status, 400);
    assert.equal(reversed.body.error.field, 'to');
  });
});

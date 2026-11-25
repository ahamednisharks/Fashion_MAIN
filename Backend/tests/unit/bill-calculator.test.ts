import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateBill,
  calculateLine,
  settlePayments,
} from '../../src/modules/sales/bill-calculator.js';
import { financialYearOf, formatInvoiceNo } from '../../src/modules/sales/invoice-number.js';
import { supplyTypeFor } from '../../src/modules/sales/sales.service.js';

// The same cases are tested in Frontend/src/app/features/billing/bill-calculator.spec.ts.
describe('bill calculator', () => {
  it('extracts GST from an inclusive price and splits CGST / SGST', () => {
    assert.deepEqual(
      calculateLine({ unitPrice: 849, quantity: 2, discountPercent: 0, gstRate: 5 }, 'intra'),
      {
        grossAmount: 1698,
        discountAmount: 0,
        taxableValue: 1617.14,
        cgstAmount: 40.43,
        sgstAmount: 40.43,
        igstAmount: 0,
        lineTotal: 1698,
      },
    );
  });

  it('applies the line discount before tax and puts odd paise on SGST', () => {
    assert.deepEqual(
      calculateLine({ unitPrice: 1299, quantity: 1, discountPercent: 10, gstRate: 5 }, 'intra'),
      {
        grossAmount: 1299,
        discountAmount: 129.9,
        taxableValue: 1113.43,
        cgstAmount: 27.84,
        sgstAmount: 27.83,
        igstAmount: 0,
        lineTotal: 1169.1,
      },
    );
  });

  it('uses IGST for inter-state supply', () => {
    const line = calculateLine(
      { unitPrice: 2360, quantity: 1, discountPercent: 0, gstRate: 18 },
      'inter',
    );
    assert.equal(line.taxableValue, 2000);
    assert.equal(line.igstAmount, 360);
    assert.equal(line.cgstAmount + line.sgstAmount, 0);
  });

  it('handles fabric quantities with decimals', () => {
    const line = calculateLine(
      { unitPrice: 349.5, quantity: 2.25, discountPercent: 0, gstRate: 5 },
      'intra',
    );
    assert.equal(line.grossAmount, 786.38); // 786.375 rounded half up
  });

  it('totals lines and rounds the bill to the nearest rupee', () => {
    const { totals, lines } = calculateBill(
      [
        { unitPrice: 849, quantity: 2, discountPercent: 0, gstRate: 5 },
        { unitPrice: 1299, quantity: 1, discountPercent: 10, gstRate: 5 },
        { unitPrice: 499, quantity: 1, discountPercent: 0, gstRate: 5 },
      ],
      'intra',
    );
    assert.equal(lines.length, 3);
    assert.deepEqual(totals, {
      itemCount: 3,
      totalQuantity: 4,
      grossAmount: 3496,
      discountTotal: 129.9,
      taxableTotal: 3205.81, // 1617.14 + 1113.43 + 475.24
      cgstTotal: 80.15,
      sgstTotal: 80.14,
      igstTotal: 0,
      netAmount: 3366.1,
      roundOff: -0.1,
      grandTotal: 3366,
    });
    // Taxable + tax always adds back to the amount payable before round-off.
    assert.equal(
      Math.round((totals.taxableTotal + totals.cgstTotal + totals.sgstTotal) * 100),
      Math.round(totals.netAmount * 100),
    );
  });

  it('rounds 50 paise up', () => {
    const { totals } = calculateBill(
      [{ unitPrice: 100.5, quantity: 1, discountPercent: 0, gstRate: 0 }],
      'intra',
    );
    assert.equal(totals.grandTotal, 101);
    assert.equal(totals.roundOff, 0.5);
  });
});

describe('payments', () => {
  it('returns change from cash', () => {
    assert.deepEqual(settlePayments([{ mode: 'cash', amount: 2000 }], 1698), {
      ok: true,
      amountReceived: 2000,
      changeReturned: 302,
    });
  });

  it('accepts split payments that cover the bill', () => {
    const result = settlePayments(
      [
        { mode: 'upi', amount: 1000 },
        { mode: 'cash', amount: 700 },
      ],
      1698,
    );
    assert.deepEqual(result, { ok: true, amountReceived: 1700, changeReturned: 2 });
  });

  it('rejects short payments and UPI / card above the bill', () => {
    assert.deepEqual(settlePayments([{ mode: 'cash', amount: 1000 }], 1698), {
      ok: false,
      message: 'Payment is short by ₹698.00.',
    });
    assert.equal(settlePayments([{ mode: 'card', amount: 1700 }], 1698).ok, false);
    assert.equal(settlePayments([], 1).ok, false);
  });

  it('needs no payment for a zero bill', () => {
    assert.deepEqual(settlePayments([], 0), { ok: true, amountReceived: 0, changeReturned: 0 });
  });
});

describe('bill numbers', () => {
  it('uses the April–March financial year', () => {
    assert.equal(financialYearOf('2026-11-23'), '26-27');
    assert.equal(financialYearOf('2027-03-31'), '26-27');
    assert.equal(financialYearOf('2027-04-01'), '27-28');
    assert.equal(financialYearOf('2099-12-01'), '99-00');
  });

  it('formats a GST-compliant number (max 16 characters)', () => {
    assert.equal(formatInvoiceNo('26-27', 42), 'INV/26-27/00042');
    assert.ok(formatInvoiceNo('26-27', 999_999).length <= 16);
  });
});

describe('supply type', () => {
  const shop = {
    shopName: 'Shop',
    phone: '',
    email: '',
    gstNumber: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    pincode: '',
  };
  const customer = (gstNumber: string, state = '') => ({
    id: 'c',
    name: 'C',
    mobile: '9876543210',
    gstNumber,
    state,
    status: 'active' as const,
  });

  it('is intra-state for walk-in and unregistered customers', () => {
    assert.equal(supplyTypeFor(shop, null), 'intra');
    assert.equal(supplyTypeFor(shop, customer('', 'Kerala')), 'intra');
  });

  it("is inter-state when a registered customer's GSTIN is from another state", () => {
    assert.equal(supplyTypeFor(shop, customer('27AAPFU0939F1ZV')), 'inter'); // Maharashtra
    assert.equal(supplyTypeFor(shop, customer('33ABCPT7712M1ZD')), 'intra'); // Tamil Nadu
    assert.equal(supplyTypeFor({ ...shop, state: '' }, customer('27AAPFU0939F1ZV')), 'intra');
  });
});

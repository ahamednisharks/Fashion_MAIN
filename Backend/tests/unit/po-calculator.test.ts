import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculatePo, calculatePoLine } from '../../src/modules/purchase-orders/po-calculator.js';
import { financialYearStart, formatPoNo } from '../../src/modules/purchase-orders/po-number.js';
import { poSupplyTypeFor } from '../../src/modules/purchase-orders/purchase-orders.service.js';

// The same cases are tested in Frontend/src/app/features/purchase/po-calculator.spec.ts.
describe('purchase order calculator', () => {
  it('adds GST on top of the rate and splits CGST / SGST equally', () => {
    assert.deepEqual(
      calculatePoLine({ rate: 420, quantity: 10, discountPercent: 0, gstRate: 5 }, 'intra'),
      {
        grossAmount: 4200,
        discountAmount: 0,
        taxableValue: 4200,
        cgstAmount: 105,
        sgstAmount: 105,
        igstAmount: 0,
        lineTotal: 4410,
      },
    );
  });

  it('applies the discount before tax and rounds each tax to the paisa', () => {
    const line = { rate: 999.99, quantity: 3, discountPercent: 7.5, gstRate: 12 };
    assert.deepEqual(calculatePoLine(line, 'intra'), {
      grossAmount: 2999.97,
      discountAmount: 225,
      taxableValue: 2774.97,
      cgstAmount: 166.5,
      sgstAmount: 166.5,
      igstAmount: 0,
      lineTotal: 3107.97,
    });
    assert.deepEqual(calculatePoLine(line, 'inter'), {
      grossAmount: 2999.97,
      discountAmount: 225,
      taxableValue: 2774.97,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 333,
      lineTotal: 3107.97,
    });
  });

  it('allows metres for fabric and 0% GST', () => {
    assert.equal(
      calculatePoLine({ rate: 150.5, quantity: 2.75, discountPercent: 0, gstRate: 5 }, 'intra')
        .lineTotal,
      434.58,
    );
    assert.equal(
      calculatePoLine({ rate: 100, quantity: 1, discountPercent: 0, gstRate: 0 }, 'intra')
        .lineTotal,
      100,
    );
  });

  it('totals the lines and rounds the PO to the nearest rupee', () => {
    const { totals, lines } = calculatePo(
      [
        { rate: 420, quantity: 10, discountPercent: 0, gstRate: 5 },
        { rate: 999.99, quantity: 3, discountPercent: 7.5, gstRate: 12 },
      ],
      'intra',
    );
    assert.equal(lines.length, 2);
    assert.deepEqual(totals, {
      itemCount: 2,
      totalQuantity: 13,
      grossAmount: 7199.97,
      discountTotal: 225,
      taxableTotal: 6974.97,
      cgstTotal: 271.5,
      sgstTotal: 271.5,
      igstTotal: 0,
      netAmount: 7517.97,
      roundOff: 0.03,
      grandTotal: 7518,
    });
  });
});

describe('purchase order numbers', () => {
  it('uses the year the April–March financial year starts in', () => {
    assert.equal(financialYearStart('2026-11-24'), 2026);
    assert.equal(financialYearStart('2027-02-15'), 2026);
    assert.equal(financialYearStart('2027-03-31'), 2026);
    assert.equal(financialYearStart('2027-04-01'), 2027);
  });

  it('formats PO-<year>-<5 digits>', () => {
    assert.equal(formatPoNo(2026, 1), 'PO-2026-00001');
    assert.equal(formatPoNo(2026, 42), 'PO-2026-00042');
    assert.equal(formatPoNo(2026, 123456), 'PO-2026-123456');
  });
});

describe('purchase supply type', () => {
  it('is IGST for a supplier in another state, CGST + SGST otherwise', () => {
    const mumbai = { gstNumber: '27AABCM9034E1ZL', state: 'Maharashtra' };
    assert.equal(poSupplyTypeFor('Tamil Nadu', mumbai), 'inter');
    assert.equal(poSupplyTypeFor('Maharashtra', mumbai), 'intra');
    assert.equal(poSupplyTypeFor('', mumbai), 'intra', 'unknown shop state');
    assert.equal(poSupplyTypeFor('Tamil Nadu', { gstNumber: '', state: 'Kerala' }), 'inter');
    assert.equal(poSupplyTypeFor('Tamil Nadu', { gstNumber: '', state: '' }), 'intra');
    // The GSTIN decides when the typed state disagrees.
    assert.equal(poSupplyTypeFor('Tamil Nadu', { ...mumbai, state: 'Tamil Nadu' }), 'inter');
  });
});

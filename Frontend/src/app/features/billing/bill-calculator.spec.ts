import { calculateBill, calculateLine, settlePayments } from './bill-calculator';

// Same cases as Backend/tests/unit/bill-calculator.test.ts — the two copies must agree.
describe('bill calculator', () => {
  it('extracts GST from an inclusive price and splits CGST / SGST', () => {
    expect(
      calculateLine({ unitPrice: 849, quantity: 2, discountPercent: 0, gstRate: 5 }, 'intra'),
    ).toEqual({
      grossAmount: 1698,
      discountAmount: 0,
      taxableValue: 1617.14,
      cgstAmount: 40.43,
      sgstAmount: 40.43,
      igstAmount: 0,
      lineTotal: 1698,
    });
  });

  it('applies the line discount before tax and puts odd paise on SGST', () => {
    expect(
      calculateLine({ unitPrice: 1299, quantity: 1, discountPercent: 10, gstRate: 5 }, 'intra'),
    ).toEqual({
      grossAmount: 1299,
      discountAmount: 129.9,
      taxableValue: 1113.43,
      cgstAmount: 27.84,
      sgstAmount: 27.83,
      igstAmount: 0,
      lineTotal: 1169.1,
    });
  });

  it('uses IGST for inter-state supply', () => {
    const line = calculateLine(
      { unitPrice: 2360, quantity: 1, discountPercent: 0, gstRate: 18 },
      'inter',
    );
    expect(line.taxableValue).toBe(2000);
    expect(line.igstAmount).toBe(360);
    expect(line.cgstAmount + line.sgstAmount).toBe(0);
  });

  it('handles fabric quantities with decimals', () => {
    const line = calculateLine(
      { unitPrice: 349.5, quantity: 2.25, discountPercent: 0, gstRate: 5 },
      'intra',
    );
    expect(line.grossAmount).toBe(786.38);
  });

  it('totals lines and rounds the bill to the nearest rupee', () => {
    const { totals } = calculateBill(
      [
        { unitPrice: 849, quantity: 2, discountPercent: 0, gstRate: 5 },
        { unitPrice: 1299, quantity: 1, discountPercent: 10, gstRate: 5 },
        { unitPrice: 499, quantity: 1, discountPercent: 0, gstRate: 5 },
      ],
      'intra',
    );
    expect(totals).toEqual({
      itemCount: 3,
      totalQuantity: 4,
      grossAmount: 3496,
      discountTotal: 129.9,
      taxableTotal: 3205.81,
      cgstTotal: 80.15,
      sgstTotal: 80.14,
      igstTotal: 0,
      netAmount: 3366.1,
      roundOff: -0.1,
      grandTotal: 3366,
    });
  });

  it('rounds 50 paise up', () => {
    const { totals } = calculateBill(
      [{ unitPrice: 100.5, quantity: 1, discountPercent: 0, gstRate: 0 }],
      'intra',
    );
    expect(totals.grandTotal).toBe(101);
    expect(totals.roundOff).toBe(0.5);
  });
});

describe('payments', () => {
  it('returns change from cash and accepts split payments', () => {
    expect(settlePayments([{ mode: 'cash', amount: 2000 }], 1698)).toEqual({
      ok: true,
      amountReceived: 2000,
      changeReturned: 302,
    });
    expect(
      settlePayments(
        [
          { mode: 'upi', amount: 1000 },
          { mode: 'cash', amount: 700 },
        ],
        1698,
      ),
    ).toEqual({ ok: true, amountReceived: 1700, changeReturned: 2 });
  });

  it('rejects short payments and UPI / card above the bill', () => {
    expect(settlePayments([{ mode: 'cash', amount: 1000 }], 1698)).toEqual({
      ok: false,
      message: 'Payment is short by ₹698.00.',
    });
    expect(settlePayments([{ mode: 'card', amount: 1700 }], 1698).ok).toBe(false);
    expect(settlePayments([], 0)).toEqual({ ok: true, amountReceived: 0, changeReturned: 0 });
  });
});

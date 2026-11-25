import { calculatePo, calculatePoLine } from './po-calculator';

// The same cases are tested in Backend/tests/unit/po-calculator.test.ts.
describe('purchase order calculator', () => {
  it('adds GST on top of the rate and splits CGST / SGST equally', () => {
    expect(
      calculatePoLine({ rate: 420, quantity: 10, discountPercent: 0, gstRate: 5 }, 'intra'),
    ).toEqual({
      grossAmount: 4200,
      discountAmount: 0,
      taxableValue: 4200,
      cgstAmount: 105,
      sgstAmount: 105,
      igstAmount: 0,
      lineTotal: 4410,
    });
  });

  it('applies the discount before tax and rounds each tax to the paisa', () => {
    const line = { rate: 999.99, quantity: 3, discountPercent: 7.5, gstRate: 12 };
    expect(calculatePoLine(line, 'intra')).toEqual({
      grossAmount: 2999.97,
      discountAmount: 225,
      taxableValue: 2774.97,
      cgstAmount: 166.5,
      sgstAmount: 166.5,
      igstAmount: 0,
      lineTotal: 3107.97,
    });
    expect(calculatePoLine(line, 'inter')).toEqual({
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
    expect(
      calculatePoLine({ rate: 150.5, quantity: 2.75, discountPercent: 0, gstRate: 5 }, 'intra')
        .lineTotal,
    ).toBe(434.58);
    expect(
      calculatePoLine({ rate: 100, quantity: 1, discountPercent: 0, gstRate: 0 }, 'intra')
        .lineTotal,
    ).toBe(100);
  });

  it('totals the lines and rounds the PO to the nearest rupee', () => {
    const { totals, lines } = calculatePo(
      [
        { rate: 420, quantity: 10, discountPercent: 0, gstRate: 5 },
        { rate: 999.99, quantity: 3, discountPercent: 7.5, gstRate: 12 },
      ],
      'intra',
    );
    expect(lines.length).toBe(2);
    expect(totals).toEqual({
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

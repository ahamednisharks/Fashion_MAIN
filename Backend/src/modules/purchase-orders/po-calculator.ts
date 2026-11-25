/*
 * Purchase order arithmetic. Supplier rates are GST-EXCLUSIVE, so tax is added on top:
 *
 *   gross    = rate × quantity
 *   discount = gross × discount% / 100
 *   taxable  = gross − discount
 *   CGST     = SGST = taxable × (GST rate / 2) / 100      (same state)
 *   IGST     = taxable × GST rate / 100                   (another state)
 *   line     = taxable + tax
 *
 * The PO total is rounded to the nearest rupee and the difference shown as round-off.
 * Everything is computed in whole paise so totals always add up exactly.
 *
 * KEEP IN SYNC with Frontend/src/app/features/purchase/po-calculator.ts (same rules, same tests).
 */

export type SupplyType = 'intra' | 'inter';

export interface PoLineInput {
  /** GST-exclusive rate per unit (₹). */
  readonly rate: number;
  readonly quantity: number;
  /** 0–100. */
  readonly discountPercent: number;
  /** Percent, e.g. 5. */
  readonly gstRate: number;
}

export interface PoLineAmounts {
  readonly grossAmount: number;
  readonly discountAmount: number;
  readonly taxableValue: number;
  readonly cgstAmount: number;
  readonly sgstAmount: number;
  readonly igstAmount: number;
  /** Taxable value + GST. */
  readonly lineTotal: number;
}

export interface PoTotals {
  readonly itemCount: number;
  readonly totalQuantity: number;
  readonly grossAmount: number;
  readonly discountTotal: number;
  readonly taxableTotal: number;
  readonly cgstTotal: number;
  readonly sgstTotal: number;
  readonly igstTotal: number;
  /** Sum of line totals before rounding. */
  readonly netAmount: number;
  readonly roundOff: number;
  /** PO value (whole rupees). */
  readonly grandTotal: number;
}

export interface PoCalculation {
  readonly lines: PoLineAmounts[];
  readonly totals: PoTotals;
}

/** Rounds half up, ignoring binary floating-point noise (10612.499999999998 → 10613). */
function roundHalfUp(value: number): number {
  return Math.round(Number(value.toFixed(6)));
}

const toPaise = (rupees: number) => roundHalfUp(rupees * 100);
const toRupees = (paise: number) => paise / 100;

interface LinePaise {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

function linePaise(line: PoLineInput, supplyType: SupplyType): LinePaise {
  const gross = roundHalfUp(toPaise(line.rate) * line.quantity);
  const discount = roundHalfUp((gross * line.discountPercent) / 100);
  const taxable = gross - discount;
  const half = supplyType === 'intra' ? roundHalfUp((taxable * line.gstRate) / 200) : 0;
  const igst = supplyType === 'inter' ? roundHalfUp((taxable * line.gstRate) / 100) : 0;
  return {
    gross,
    discount,
    taxable,
    cgst: half,
    sgst: half,
    igst,
    total: taxable + 2 * half + igst,
  };
}

function toAmounts(p: LinePaise): PoLineAmounts {
  return {
    grossAmount: toRupees(p.gross),
    discountAmount: toRupees(p.discount),
    taxableValue: toRupees(p.taxable),
    cgstAmount: toRupees(p.cgst),
    sgstAmount: toRupees(p.sgst),
    igstAmount: toRupees(p.igst),
    lineTotal: toRupees(p.total),
  };
}

export function calculatePoLine(line: PoLineInput, supplyType: SupplyType): PoLineAmounts {
  return toAmounts(linePaise(line, supplyType));
}

export function calculatePo(lines: readonly PoLineInput[], supplyType: SupplyType): PoCalculation {
  const paise = lines.map((line) => linePaise(line, supplyType));
  const sum = (pick: (line: LinePaise) => number) =>
    paise.reduce((total, line) => total + pick(line), 0);

  const net = sum((line) => line.total);
  const grand = roundHalfUp(net / 100) * 100;
  const quantity = lines.reduce((total, line) => total + line.quantity, 0);

  return {
    lines: paise.map(toAmounts),
    totals: {
      itemCount: lines.length,
      totalQuantity: roundHalfUp(quantity * 1000) / 1000,
      grossAmount: toRupees(sum((line) => line.gross)),
      discountTotal: toRupees(sum((line) => line.discount)),
      taxableTotal: toRupees(sum((line) => line.taxable)),
      cgstTotal: toRupees(sum((line) => line.cgst)),
      sgstTotal: toRupees(sum((line) => line.sgst)),
      igstTotal: toRupees(sum((line) => line.igst)),
      netAmount: toRupees(net),
      roundOff: toRupees(grand - net),
      grandTotal: toRupees(grand),
    },
  };
}

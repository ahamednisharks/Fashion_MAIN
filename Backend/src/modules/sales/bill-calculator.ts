/*
 * Bill arithmetic. Prices are GST-inclusive (like MRP), so tax is worked backwards:
 *
 *   gross    = rate × quantity
 *   discount = gross × discount% / 100
 *   amount   = gross − discount                       (what the customer pays for the line)
 *   taxable  = amount × 100 / (100 + GST rate)
 *   tax      = amount − taxable  → CGST + SGST (half each) or IGST
 *
 * The bill total is rounded to the nearest rupee and the difference shown as round-off.
 * Everything is computed in whole paise so totals always add up exactly.
 *
 * KEEP IN SYNC with Frontend/src/app/features/billing/bill-calculator.ts (same rules, same tests).
 */

export type SupplyType = 'intra' | 'inter';
export type PaymentMode = 'cash' | 'upi' | 'card';

export interface BillLineInput {
  /** GST-inclusive rate per unit (₹). */
  readonly unitPrice: number;
  readonly quantity: number;
  /** 0–100. */
  readonly discountPercent: number;
  /** Percent, e.g. 5. */
  readonly gstRate: number;
}

export interface BillLineAmounts {
  readonly grossAmount: number;
  readonly discountAmount: number;
  readonly taxableValue: number;
  readonly cgstAmount: number;
  readonly sgstAmount: number;
  readonly igstAmount: number;
  /** Amount payable for the line (GST included). */
  readonly lineTotal: number;
}

export interface BillTotals {
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
  /** Amount payable (whole rupees). */
  readonly grandTotal: number;
}

export interface BillCalculation {
  readonly lines: BillLineAmounts[];
  readonly totals: BillTotals;
}

export interface PaymentInput {
  readonly mode: PaymentMode;
  readonly amount: number;
}

export type PaymentSettlement =
  | { readonly ok: true; readonly amountReceived: number; readonly changeReturned: number }
  | { readonly ok: false; readonly message: string };

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

function linePaise(line: BillLineInput, supplyType: SupplyType): LinePaise {
  const gross = roundHalfUp(toPaise(line.unitPrice) * line.quantity);
  const discount = roundHalfUp((gross * line.discountPercent) / 100);
  const total = gross - discount;
  const taxable = roundHalfUp((total * 100) / (100 + line.gstRate));
  const tax = total - taxable;
  const cgst = supplyType === 'intra' ? roundHalfUp(tax / 2) : 0;
  const sgst = supplyType === 'intra' ? tax - cgst : 0;
  const igst = supplyType === 'inter' ? tax : 0;
  return { gross, discount, taxable, cgst, sgst, igst, total };
}

function toAmounts(p: LinePaise): BillLineAmounts {
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

export function calculateLine(line: BillLineInput, supplyType: SupplyType): BillLineAmounts {
  return toAmounts(linePaise(line, supplyType));
}

export function calculateBill(
  lines: readonly BillLineInput[],
  supplyType: SupplyType,
): BillCalculation {
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

/**
 * Checks the payments cover the bill. Only cash can exceed the bill (the excess is returned as
 * change); UPI / card together can never be more than the bill amount.
 */
export function settlePayments(
  payments: readonly PaymentInput[],
  grandTotal: number,
): PaymentSettlement {
  const total = toPaise(grandTotal);
  const nonCash = payments
    .filter((payment) => payment.mode !== 'cash')
    .reduce((sum, payment) => sum + toPaise(payment.amount), 0);
  const received = payments.reduce((sum, payment) => sum + toPaise(payment.amount), 0);

  if (nonCash > total) {
    return { ok: false, message: 'UPI / card payments cannot be more than the bill amount.' };
  }
  if (received < total) {
    return {
      ok: false,
      message: `Payment is short by ₹${formatRupees(toRupees(total - received))}.`,
    };
  }
  return {
    ok: true,
    amountReceived: toRupees(received),
    changeReturned: toRupees(received - total),
  };
}

/** 1234.5 → "1,234.50" (Indian digit grouping). */
export function formatRupees(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

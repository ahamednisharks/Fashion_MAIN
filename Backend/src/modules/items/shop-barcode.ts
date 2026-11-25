/**
 * The shop's own barcodes: EAN-13 numbers in the GS1 in-store range (first digit 2), built as
 * prefix (3 digits) + running number (9 digits) + check digit — e.g. 200 000000001 5.
 * Keep in sync with Frontend `shared/barcode/ean13.ts` (same check digit rule and tests).
 */

export const RUNNING_NUMBER_DIGITS = 9;
export const MAX_RUNNING_NUMBER = 10 ** RUNNING_NUMBER_DIGITS - 1;
export const BARCODE_PREFIX_PATTERN = /^2[0-9]{2}$/;

/** EAN-13 check digit of the first 12 digits (weights 1, 3, 1, 3 … from the left). */
export function ean13CheckDigit(first12: string): number {
  if (!/^[0-9]{12}$/.test(first12)) {
    throw new Error(`EAN-13 needs 12 digits before the check digit, got "${first12}".`);
  }
  let sum = 0;
  for (let index = 0; index < 12; index++) {
    sum += Number(first12[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** True for 13 digits whose last digit is the correct check digit. */
export function isValidEan13(code: string): boolean {
  return /^[0-9]{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** shopBarcode('200', 1) → '2000000000015'. */
export function shopBarcode(prefix: string, runningNumber: number): string {
  if (!BARCODE_PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Barcode prefix must be 3 digits starting with 2, got "${prefix}".`);
  }
  if (!Number.isInteger(runningNumber) || runningNumber < 1 || runningNumber > MAX_RUNNING_NUMBER) {
    throw new Error(`Running number out of range: ${runningNumber}.`);
  }
  const first12 = prefix + String(runningNumber).padStart(RUNNING_NUMBER_DIGITS, '0');
  return first12 + String(ean13CheckDigit(first12));
}

/**
 * EAN-13: check digit and bar pattern. The shop's own barcodes are EAN-13 numbers in the
 * in-store range (prefix 200–299). The check digit rule is the same as the backend's
 * `modules/items/shop-barcode.ts` (same test cases in both).
 */

/** Left-hand digits, odd parity ("L") — the even-parity ("G") codes are these reversed and inverted. */
const L_CODES = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G_CODES = L_CODES.map((code) =>
  [...code]
    .reverse()
    .map((bit) => (bit === '1' ? '0' : '1'))
    .join(''),
);
/** Right-hand digits ("R") — the L codes inverted. */
const R_CODES = L_CODES.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''));
/** Which left-hand digits use G codes; this encodes the first digit, which has no bars. */
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

/** Blank modules required on each side of an EAN-13 symbol. */
export const EAN13_QUIET_LEFT = 11;
export const EAN13_QUIET_RIGHT = 7;

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

/**
 * The 95 modules of an EAN-13 symbol ('1' = bar, '0' = space), without quiet zones:
 * start guard, 6 left digits, centre guard, 6 right digits, end guard.
 */
export function encodeEan13(code: string): string {
  if (!isValidEan13(code)) {
    throw new Error(`Not a valid EAN-13 number: "${code}".`);
  }
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]];
  let left = '';
  for (let index = 1; index <= 6; index++) {
    left += (parity[index - 1] === 'L' ? L_CODES : G_CODES)[digits[index]];
  }
  let right = '';
  for (let index = 7; index <= 12; index++) {
    right += R_CODES[digits[index]];
  }
  return `101${left}01010${right}101`;
}

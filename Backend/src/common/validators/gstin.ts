import { type IndianState, findStateByGstCode } from './indian-states.js';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type GstinProblem = 'format' | 'state' | 'checksum';

/** GSTIN check character (15th) for the first 14 characters (mod-36 Luhn variant). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARSET.indexOf(first14.charAt(i)) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET.charAt((36 - (sum % 36)) % 36);
}

/** Returns null for a valid (uppercase) GSTIN, otherwise the first problem found. */
export function checkGstin(value: string): GstinProblem | null {
  if (!GSTIN_PATTERN.test(value)) {
    return 'format';
  }
  if (!findStateByGstCode(value.slice(0, 2))) {
    return 'state';
  }
  return gstinCheckChar(value.slice(0, 14)) === value.charAt(14) ? null : 'checksum';
}

export function stateFromGstin(value: string): IndianState | undefined {
  return /^\d{2}/.test(value) ? findStateByGstCode(value.slice(0, 2)) : undefined;
}

export const GSTIN_MESSAGES: Record<GstinProblem, string> = {
  format: 'Enter a valid 15-character GST number, e.g. 33ABCDE1234F1Z5.',
  state: 'The first two digits are not a valid GST state code.',
  checksum: 'The last character (check digit) of the GST number is incorrect.',
};

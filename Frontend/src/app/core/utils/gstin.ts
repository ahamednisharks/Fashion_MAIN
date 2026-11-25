import { IndianState, findStateByGstCode } from '../constants/indian-states';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type GstinProblem = 'format' | 'checksum' | 'state';

/** Computes the GSTIN check character (15th character) for the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARSET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

/** Returns null when valid, otherwise the first problem found. Expects an uppercase value. */
export function checkGstin(value: string): GstinProblem | null {
  if (!GSTIN_PATTERN.test(value)) {
    return 'format';
  }
  if (!findStateByGstCode(value.slice(0, 2))) {
    return 'state';
  }
  return gstinCheckChar(value.slice(0, 14)) === value[14] ? null : 'checksum';
}

export function stateFromGstin(value: string): IndianState | undefined {
  return /^\d{2}/.test(value) ? findStateByGstCode(value.slice(0, 2)) : undefined;
}

import { z } from 'zod';

import { GSTIN_MESSAGES, checkGstin, stateFromGstin } from './gstin.js';
import { INDIAN_STATE_NAMES } from './indian-states.js';

/*
 * Reusable request field schemas. They normalise input the way the database stores it
 * (trimmed text, '' for empty optional text, uppercase codes, lowercase email).
 */

export const MAX_MONEY = 9_999_999.99;

const collapseSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

export const uuidField = (label = 'ID') => z.uuid({ error: `${label} must be a valid UUID.` });

export const statusField = z
  .enum(['active', 'inactive'], { error: "Status must be 'active' or 'inactive'." })
  .default('active');

export const statusEnum = z.enum(['active', 'inactive']);
export type EntityStatus = z.infer<typeof statusEnum>;

/** Required single-line text (trimmed, inner whitespace collapsed). */
export function requiredText(label: string, max: number) {
  return z
    .string({ error: `${label} is required.` })
    .transform(collapseSpaces)
    .pipe(
      z
        .string()
        .min(1, { error: `${label} is required.` })
        .max(max, { error: `${label} can be at most ${max} characters.` }),
    );
}

/** Optional text; null/undefined become ''. */
export function optionalText(label: string, max: number) {
  return z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, { error: `${label} can be at most ${max} characters.` })
    .nullish()
    .transform((value) => value ?? '');
}

/** Optional text matching a pattern ('' allowed). */
function optionalPattern(
  label: string,
  max: number,
  pattern: RegExp,
  message: string,
  normalise?: (v: string) => string,
) {
  return z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, { error: `${label} can be at most ${max} characters.` })
    .nullish()
    .transform((value) => (normalise ? normalise(value ?? '') : (value ?? '')))
    .refine((value) => value === '' || pattern.test(value), { error: message });
}

const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const MOBILE_MESSAGE = 'Enter a valid 10-digit mobile number starting with 6–9.';

/** Strips spaces, dashes and a +91 / 0 prefix: "+91 98765-43210" → "9876543210". */
function mobileDigits(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Indian mobile number; accepts +91 / 0 prefixes and spaces, stores 10 digits. */
export const mobileField = z
  .string({ error: 'Mobile number is required.' })
  .transform(mobileDigits)
  .pipe(z.string().regex(MOBILE_PATTERN, { error: MOBILE_MESSAGE }));

/** Optional mobile number: null/undefined/blank → ''. */
export const optionalMobileField = z
  .string({ error: 'Mobile number must be text.' })
  .nullish()
  .transform((value) => mobileDigits(value ?? ''))
  .refine((value) => value === '' || MOBILE_PATTERN.test(value), { error: MOBILE_MESSAGE });

export const emailField = optionalPattern(
  'Email',
  100,
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  'Enter a valid email address.',
  (value) => value.toLowerCase(),
);

export const pincodeField = optionalPattern(
  'Pincode',
  6,
  /^[1-9]\d{5}$/,
  'Enter a valid 6-digit pincode.',
);

export const stateField = z
  .string({ error: 'State must be text.' })
  .trim()
  .nullish()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || INDIAN_STATE_NAMES.includes(value), {
    error: 'Select a valid Indian state or union territory.',
  });

/** Optional GSTIN: format, state code and check digit. */
export const gstinField = z
  .string({ error: 'GST number must be text.' })
  .trim()
  .nullish()
  .transform((value) => (value ?? '').toUpperCase())
  .superRefine((value, ctx) => {
    const problem = value ? checkGstin(value) : null;
    if (problem) {
      ctx.addIssue({ code: 'custom', message: GSTIN_MESSAGES[problem] });
    }
  });

/** Adds an issue when a GSTIN's state code does not match the selected state. */
export function checkGstinMatchesState(
  value: { gstNumber: string; state: string },
  ctx: z.RefinementCtx,
): void {
  if (!value.gstNumber || !value.state || checkGstin(value.gstNumber)) {
    return;
  }
  const gstState = stateFromGstin(value.gstNumber);
  if (gstState && gstState.name !== value.state) {
    ctx.addIssue({
      code: 'custom',
      path: ['gstNumber'],
      message: `This GST number is registered in ${gstState.name}, but the state is ${value.state}.`,
    });
  }
}

/** Non-negative INR amount with at most 2 decimals. */
export function moneyField(label: string) {
  return z
    .number({ error: `${label} must be a number.` })
    .min(0, { error: `${label} cannot be negative.` })
    .max(MAX_MONEY, { error: `${label} cannot be more than ₹99,99,999.99.` })
    .refine((value) => Math.round(value * 100) / 100 === value, {
      error: `${label} can have at most 2 decimal places.`,
    });
}

/** Optional amount: null/undefined → null. */
export function optionalMoneyField(label: string) {
  return moneyField(label)
    .nullish()
    .transform((value) => value ?? null);
}

/** HEX colour: accepts #abc, abc, #aabbcc; stores #AABBCC. */
export const hexColorField = z
  .string({ error: 'Color code is required.' })
  .trim()
  .transform((value) => {
    const raw = value.replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) {
      return `#${[...raw]
        .map((c) => c + c)
        .join('')
        .toUpperCase()}`;
    }
    return `#${raw.toUpperCase()}`;
  })
  .pipe(
    z.string().regex(/^#[0-9A-F]{6}$/, { error: 'Enter a valid HEX colour code, e.g. #1F2A5A.' }),
  );

export const hsnField = optionalPattern(
  'HSN code',
  8,
  /^(\d{4}|\d{6}|\d{8})$/,
  'HSN code must be 4, 6 or 8 digits.',
);

/** Product code / SKU: uppercase letters, digits, - _ /. */
export function codeField(label: string, max: number) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .toUpperCase()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `${label} can be at most ${max} characters.` })
    .regex(/^[A-Z0-9][A-Z0-9_/-]*$/, {
      error: `${label} can contain only letters, numbers, hyphen (-), slash (/) or underscore (_).`,
    });
}

export const barcodeField = optionalPattern(
  'Barcode',
  48,
  /^[A-Za-z0-9-]{4,48}$/,
  'Barcode must be 4–48 letters, numbers or hyphens.',
);

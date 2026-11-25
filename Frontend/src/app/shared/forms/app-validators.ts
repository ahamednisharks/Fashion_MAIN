import { AbstractControl, AsyncValidatorFn, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Observable, catchError, map, of, switchMap, timer } from 'rxjs';

import { INDIAN_STATES } from '../../core/constants/indian-states';
import { checkGstin, stateFromGstin } from '../../core/utils/gstin';

const PATTERNS = {
  mobile: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  pincode: /^[1-9]\d{5}$/,
  hsn: /^(\d{4}|\d{6}|\d{8})$/,
  hexColor: /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i,
  code: /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/,
  barcode: /^[A-Za-z0-9-]{4,48}$/,
  // Same rule as the backend: 3–40 chars, lower-case letters, digits, dot, hyphen, underscore.
  username: /^[a-z0-9][a-z0-9._-]{2,39}$/,
} as const;

/** Upper limit for any money value (₹ 99,99,999.99). */
export const MAX_MONEY = 9_999_999.99;

function text(control: AbstractControl): string {
  const value: unknown = control.value;
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

/** Builds a validator that ignores empty values (combine with `required` when mandatory). */
function patternRule(key: keyof typeof PATTERNS): ValidatorFn {
  return (control) => {
    const value = text(control);
    return value && !PATTERNS[key].test(value) ? { [key]: true } : null;
  };
}

/** Custom validators shared by all master forms. Error keys map to messages in validation-messages.ts. */
export class AppValidators {
  /** Like Validators.required, but whitespace-only strings are also treated as empty. */
  static readonly required: ValidatorFn = (control) => {
    const value: unknown = control.value;
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (typeof value === 'number' && Number.isNaN(value));
    return empty ? { required: true } : null;
  };

  static readonly mobile = patternRule('mobile');
  static readonly email = patternRule('email');
  static readonly pincode = patternRule('pincode');
  static readonly hsn = patternRule('hsn');
  static readonly hexColor = patternRule('hexColor');
  static readonly code = patternRule('code');
  static readonly barcode = patternRule('barcode');
  static readonly username = patternRule('username');

  /** Password rules for passwords people choose (mirrors the backend): a letter and a number. */
  static readonly passwordStrength: ValidatorFn = (control) => {
    const value: unknown = control.value;
    if (typeof value !== 'string' || !value) {
      return null;
    }
    return /[A-Za-z]/.test(value) && /\d/.test(value) ? null : { passwordStrength: true };
  };

  /** The value must equal the sibling control `otherControlName` (e.g. "confirm password"). */
  static matches(otherControlName: string): ValidatorFn {
    return (control) => {
      const value: unknown = control.value;
      const other: unknown = control.parent?.get(otherControlName)?.value;
      return value && value !== other ? { mismatch: true } : null;
    };
  }

  /** GSTIN format, state code and check digit. */
  static readonly gstin: ValidatorFn = (control) => {
    const value = text(control).toUpperCase();
    const problem = value ? checkGstin(value) : null;
    return problem ? { gstin: problem } : null;
  };

  /**
   * GSTIN's state code must match the selected state. Re-validate this control when the state
   * control changes (see `revalidateOnChange`).
   */
  static gstinMatchesState(stateControlName: string): ValidatorFn {
    return (control) => {
      const value = text(control).toUpperCase();
      const selected: unknown = control.parent?.get(stateControlName)?.value;
      if (!value || checkGstin(value) || typeof selected !== 'string' || !selected) {
        return null;
      }
      const gstState = stateFromGstin(value);
      return gstState && gstState.name !== selected
        ? { gstinState: { gstState: gstState.name, selected } }
        : null;
    };
  }

  /** Non-negative amount with at most two decimals. Empty is allowed. */
  static money(max = MAX_MONEY): ValidatorFn {
    return (control) => {
      const value: unknown = control.value;
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const amount = Number(value);
      if (Number.isNaN(amount)) {
        return { number: true };
      }
      if (amount < 0) {
        return { min: { min: 0, actual: amount } };
      }
      if (amount > max) {
        return { max: { max, actual: amount } };
      }
      return Math.round(amount * 100) / 100 !== amount ? { decimals: true } : null;
    };
  }

  /**
   * Value must not exceed another amount, e.g. selling price ≤ MRP.
   * `limit` reads the other value lazily so cross-field rules stay in sync.
   */
  static notGreaterThan(
    limit: (control: AbstractControl) => number | null,
    limitLabel: string,
  ): ValidatorFn {
    return (control) => {
      const value: unknown = control.value;
      const max = limit(control);
      if (value === null || value === '' || max === null || Number.isNaN(Number(value))) {
        return null;
      }
      return Number(value) > max ? { notGreaterThan: { limitLabel, max } } : null;
    };
  }

  /**
   * Async uniqueness check (debounced). `check` should resolve true when the value is taken.
   */
  static unique(check: (value: string) => Observable<boolean>): AsyncValidatorFn {
    return (control) => {
      const value = text(control);
      if (!value) {
        return of(null);
      }
      return timer(350).pipe(
        switchMap(() => check(value)),
        map((taken): ValidationErrors | null => (taken ? { duplicate: true } : null)),
        // A failed check must not block the form; the server re-validates on save.
        catchError(() => of(null)),
      );
    };
  }
}

/** Indian states for <select> options. */
export const STATE_NAMES: readonly string[] = INDIAN_STATES.map((state) => state.name);

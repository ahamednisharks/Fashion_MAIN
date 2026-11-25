import { ValidationErrors } from '@angular/forms';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function numberFrom(error: unknown, key: string): number | undefined {
  if (error && typeof error === 'object' && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

function stringFrom(error: unknown, key: string): string {
  if (error && typeof error === 'object' && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }
  return '';
}

/** Returns a human-readable message for the first error on a control. */
export function validationMessage(errors: ValidationErrors | null, label: string): string | null {
  if (!errors) {
    return null;
  }
  const lower = label.toLowerCase();

  if (errors['server']) {
    return String(errors['server']);
  }
  if (errors['required']) {
    return `${label} is required.`;
  }
  if (errors['duplicate']) {
    return `This ${lower} already exists.`;
  }
  if (errors['maxlength']) {
    return `${label} can be at most ${numberFrom(errors['maxlength'], 'requiredLength')} characters.`;
  }
  if (errors['minlength']) {
    return `${label} must be at least ${numberFrom(errors['minlength'], 'requiredLength')} characters.`;
  }
  if (errors['number']) {
    return `${label} must be a number.`;
  }
  if (errors['min']) {
    return `${label} cannot be less than ${numberFrom(errors['min'], 'min')}.`;
  }
  if (errors['max']) {
    return `${label} cannot be more than ${inr.format(numberFrom(errors['max'], 'max') ?? 0)}.`;
  }
  if (errors['decimals']) {
    return `${label} can have at most 2 decimal places.`;
  }
  if (errors['notGreaterThan']) {
    const limitLabel = stringFrom(errors['notGreaterThan'], 'limitLabel');
    const max = numberFrom(errors['notGreaterThan'], 'max') ?? 0;
    return `${label} cannot be more than ${limitLabel} (${inr.format(max)}).`;
  }
  if (errors['mobile']) {
    return 'Enter a valid 10-digit mobile number starting with 6–9.';
  }
  if (errors['email']) {
    return 'Enter a valid email address, e.g. name@example.com.';
  }
  if (errors['pincode']) {
    return 'Enter a valid 6-digit pincode.';
  }
  if (errors['gstin']) {
    switch (errors['gstin']) {
      case 'checksum':
        return 'The last character (check digit) is incorrect. Please verify the GST number.';
      case 'state':
        return 'The first two digits are not a valid GST state code.';
      default:
        return 'Enter a valid 15-character GST number, e.g. 33ABCDE1234F1Z5.';
    }
  }
  if (errors['gstinState']) {
    const gstState = stringFrom(errors['gstinState'], 'gstState');
    return `This GST number is registered in ${gstState}, but the state selected is different.`;
  }
  if (errors['hsn']) {
    return 'HSN code must be 4, 6 or 8 digits.';
  }
  if (errors['hexColor']) {
    return 'Enter a valid HEX code, e.g. #1F2A5A.';
  }
  if (errors['code']) {
    return 'Use letters, numbers, hyphen (-), slash (/) or underscore (_) only.';
  }
  if (errors['barcode']) {
    return 'Barcode must be 4–48 letters, numbers or hyphens.';
  }
  if (errors['username']) {
    return 'Use 3–40 lower-case letters, numbers, dot (.), hyphen (-) or underscore (_), starting with a letter or number.';
  }
  if (errors['passwordStrength']) {
    return 'Password must contain at least one letter and one number.';
  }
  if (errors['mismatch']) {
    return 'Passwords do not match.';
  }
  if (errors['containsUsername']) {
    return 'Password must not contain your username.';
  }
  if (errors['samePassword']) {
    return 'Choose a password different from your current one.';
  }
  return `${label} is invalid.`;
}

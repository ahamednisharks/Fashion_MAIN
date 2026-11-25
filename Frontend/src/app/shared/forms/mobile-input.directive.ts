import { Directive, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Normalises Indian mobile numbers on blur so pasted values like "+91 98765 43210" or
 * "098765 43210" are stored as the 10-digit number.
 */
@Directive({
  selector: 'input[appMobileInput]',
  host: {
    type: 'tel',
    inputmode: 'numeric',
    autocomplete: 'tel',
    maxlength: '16',
    '(blur)': 'normalize()',
  },
})
export class MobileInput {
  private readonly ngControl = inject(NgControl, { self: true });

  protected normalize(): void {
    const control = this.ngControl.control;
    if (!control) {
      return;
    }
    const raw = String(control.value ?? '');
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    if (digits !== raw) {
      control.setValue(digits);
    }
  }
}

import { FormControl, FormGroup } from '@angular/forms';

import { AppValidators } from './app-validators';
import { validationMessage } from './validation-messages';

describe('AppValidators', () => {
  it('treats whitespace-only values as missing', () => {
    expect(AppValidators.required(new FormControl('   '))).toEqual({ required: true });
    expect(AppValidators.required(new FormControl('Kurtis'))).toBeNull();
  });

  it('validates Indian mobile numbers', () => {
    expect(AppValidators.mobile(new FormControl('9876543210'))).toBeNull();
    expect(AppValidators.mobile(new FormControl('5876543210'))).toEqual({ mobile: true });
    expect(AppValidators.mobile(new FormControl(''))).toBeNull();
  });

  it('validates pincode, HSN, email and HEX', () => {
    expect(AppValidators.pincode(new FormControl('641002'))).toBeNull();
    expect(AppValidators.pincode(new FormControl('041002'))).toEqual({ pincode: true });
    expect(AppValidators.hsn(new FormControl('6205'))).toBeNull();
    expect(AppValidators.hsn(new FormControl('62051'))).toEqual({ hsn: true });
    expect(AppValidators.email(new FormControl('a@b'))).toEqual({ email: true });
    expect(AppValidators.hexColor(new FormControl('#1F2A5A'))).toBeNull();
  });

  it('validates money amounts', () => {
    const money = AppValidators.money();
    expect(money(new FormControl(1299.5))).toBeNull();
    expect(money(new FormControl(-1))).toEqual({ min: { min: 0, actual: -1 } });
    expect(money(new FormControl(10.123))).toEqual({ decimals: true });
    expect(money(new FormControl(null))).toBeNull();
  });

  it('flags a GSTIN whose state does not match the selected state', () => {
    const form = new FormGroup({
      state: new FormControl('Kerala'),
      gst: new FormControl('33ABCPT7712M1ZD', AppValidators.gstinMatchesState('state')),
    });
    // Cross-field validators need the parent, so validate once the control is attached
    // (forms in the app always set values via reset/patchValue after construction).
    form.controls.gst.updateValueAndValidity();
    expect(form.controls.gst.errors).toEqual({
      gstinState: { gstState: 'Tamil Nadu', selected: 'Kerala' },
    });
    form.controls.state.setValue('Tamil Nadu');
    form.controls.gst.updateValueAndValidity();
    expect(form.controls.gst.errors).toBeNull();
  });

  it('produces readable messages', () => {
    expect(validationMessage({ required: true }, 'Mobile Number')).toBe(
      'Mobile Number is required.',
    );
    expect(validationMessage({ server: 'SKU is already used.' }, 'SKU')).toBe(
      'SKU is already used.',
    );
  });
});

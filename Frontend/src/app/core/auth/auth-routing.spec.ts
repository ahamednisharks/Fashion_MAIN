import { FormControl, FormGroup } from '@angular/forms';

import { AppValidators } from '../../shared/forms/app-validators';
import { validationMessage } from '../../shared/forms/validation-messages';
import { AuthUser } from '../models/user.model';
import { safeReturnUrl } from './auth.guards';
import { homeUrlFor } from './auth.service';

const user = (role: AuthUser['role']): AuthUser => ({
  id: '1',
  username: 'priya',
  fullName: 'Priya',
  role,
  mustChangePassword: false,
});

describe('homeUrlFor', () => {
  it('sends administrators to the dashboard and staff to billing', () => {
    expect(homeUrlFor(user('admin'))).toBe('/dashboard');
    expect(homeUrlFor(user('staff'))).toBe('/billing');
    expect(homeUrlFor(null)).toBe('/login');
  });
});

describe('safeReturnUrl', () => {
  it('keeps internal app paths', () => {
    expect(safeReturnUrl('/masters/products?page=2', '/billing')).toBe('/masters/products?page=2');
  });

  it('falls back for missing, external and sign-in URLs', () => {
    for (const value of [
      null,
      undefined,
      '',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/login?returnUrl=%2Fdashboard',
      '/account/password',
    ]) {
      expect(safeReturnUrl(value, '/billing')).toBe('/billing');
    }
  });
});

describe('password validators', () => {
  it('requires a letter and a number', () => {
    expect(AppValidators.passwordStrength(new FormControl('abcdefgh'))).toEqual({
      passwordStrength: true,
    });
    expect(AppValidators.passwordStrength(new FormControl('12345678'))).toEqual({
      passwordStrength: true,
    });
    expect(AppValidators.passwordStrength(new FormControl('shop2026'))).toBeNull();
    expect(AppValidators.passwordStrength(new FormControl(''))).toBeNull();
  });

  it('checks that the confirmation matches', () => {
    const form = new FormGroup({
      newPassword: new FormControl('shop2026'),
      confirm: new FormControl('shop2025', AppValidators.matches('newPassword')),
    });
    form.controls.confirm.updateValueAndValidity();
    expect(form.controls.confirm.errors).toEqual({ mismatch: true });
    form.controls.confirm.setValue('shop2026');
    expect(form.controls.confirm.errors).toBeNull();
    expect(validationMessage({ mismatch: true }, 'Confirm')).toBe('Passwords do not match.');
  });

  it('validates usernames like the backend does', () => {
    expect(AppValidators.username(new FormControl('priya.s'))).toBeNull();
    expect(AppValidators.username(new FormControl('pr'))).toEqual({ username: true });
    expect(AppValidators.username(new FormControl('.priya'))).toEqual({ username: true });
    expect(AppValidators.username(new FormControl('priya sharma'))).toEqual({ username: true });
  });
});

import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControlStatus } from '@angular/forms';
import { Observable, filter, firstValueFrom, merge, take } from 'rxjs';

import { ApiError } from '../../core/data-access/api.types';

/** Resolves once async validators have finished. */
export function settledStatus(control: AbstractControl): Promise<FormControlStatus> {
  if (!control.pending) {
    return Promise.resolve(control.status);
  }
  return firstValueFrom(
    control.statusChanges.pipe(
      filter((status) => status !== 'PENDING'),
      take(1),
    ),
  );
}

/**
 * Shows a server-side error on the matching control (e.g. "name" or "variants.2.sku").
 * Returns false when the error is not tied to a control, so the caller can show it elsewhere.
 */
export function applyServerError(form: AbstractControl, error: ApiError): boolean {
  const control = error.field ? form.get(error.field) : null;
  if (!control) {
    return false;
  }
  control.setErrors({ ...(control.errors ?? {}), server: error.message });
  control.markAsTouched();
  return true;
}

/** Moves focus to the first invalid field inside `container` (after a failed submit). */
export function focusFirstInvalid(container: HTMLElement): void {
  // Wait a frame so error states have rendered before scrolling.
  requestAnimationFrame(() => {
    const target = container.querySelector<HTMLElement>(
      'input.ng-invalid, select.ng-invalid, textarea.ng-invalid, .ng-invalid [role="radio"]',
    );
    target?.focus();
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

/** Re-runs validation on `target` whenever any of `sources` changes (cross-field rules). */
export function revalidateOnChange(
  target: AbstractControl,
  sources: readonly AbstractControl[],
  destroyRef: DestroyRef,
): void {
  merge(...sources.map((source): Observable<unknown> => source.valueChanges))
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe(() => target.updateValueAndValidity());
}

import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';

import { stateFromGstin } from '../../core/utils/gstin';

/**
 * Keeps a GSTIN control and a State control consistent:
 * - re-validates the GSTIN when the state changes (state-code mismatch rule);
 * - fills an empty State from the GSTIN's state code as the user types it.
 */
export function linkGstinWithState(
  gstin: AbstractControl<string>,
  state: AbstractControl<string>,
  destroyRef: DestroyRef,
): void {
  state.valueChanges
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe(() => gstin.updateValueAndValidity());

  gstin.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((value) => {
    const gstState = stateFromGstin((value ?? '').toUpperCase());
    if (gstState && !state.value) {
      state.setValue(gstState.name);
      state.markAsDirty();
    }
  });
}

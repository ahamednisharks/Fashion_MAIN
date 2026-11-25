import { ElementRef, inject, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';

import { toApiError } from '../../core/data-access/api.types';
import { ConfirmService } from '../../core/services/confirm.service';
import { Modal } from '../components/modal/modal';
import { applyServerError, focusFirstInvalid, settledStatus } from './form-utils';

/**
 * Standard save flow for a form:
 * touch all → wait for async validators → focus first invalid → call API → map server errors
 * to fields (or show a form-level error).
 */
export class FormSubmitter {
  readonly saving = signal(false);
  /** Error not tied to a specific field (shown as an alert at the top of the form). */
  readonly error = signal<string | null>(null);

  constructor(
    protected readonly form: AbstractControl,
    private readonly host: HTMLElement,
  ) {}

  /** Resolves with the API result, or null when invalid / failed. */
  async submit<T>(request: () => Observable<T>): Promise<T | null> {
    if (this.saving()) {
      return null;
    }
    this.error.set(null);
    this.form.markAllAsTouched();
    if ((await settledStatus(this.form)) !== 'VALID') {
      focusFirstInvalid(this.host);
      return null;
    }

    this.saving.set(true);
    try {
      const result = await firstValueFrom(request());
      this.form.markAsPristine();
      return result;
    } catch (error) {
      const apiError = toApiError(error);
      if (applyServerError(this.form, apiError)) {
        focusFirstInvalid(this.host);
      } else {
        this.error.set(apiError.message);
      }
      return null;
    } finally {
      this.saving.set(false);
    }
  }
}

/** FormSubmitter for forms rendered inside <app-modal>: adds a "discard changes?" guard. */
export class ModalFormController extends FormSubmitter {
  constructor(
    form: AbstractControl,
    host: HTMLElement,
    private readonly modal: Modal | null,
    private readonly confirm: ConfirmService,
  ) {
    super(form, host);
    modal?.setCloseGuard(() => this.canClose());
  }

  cancel(): void {
    void this.modal?.requestClose();
  }

  private async canClose(): Promise<boolean> {
    if (this.saving()) {
      return false;
    }
    if (!this.form.dirty) {
      return true;
    }
    return this.confirm.confirm({
      tone: 'warning',
      title: 'Discard changes?',
      message: 'You have unsaved changes in this form. Close it without saving?',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
    });
  }
}

export function injectFormSubmitter(form: AbstractControl): FormSubmitter {
  return new FormSubmitter(form, inject<ElementRef<HTMLElement>>(ElementRef).nativeElement);
}

/** Call from a form component that is projected into <app-modal>. */
export function injectModalForm(form: AbstractControl): ModalFormController {
  return new ModalFormController(
    form,
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    inject(Modal, { optional: true }),
    inject(ConfirmService),
  );
}

import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

import { ConfirmService } from '../../core/services/confirm.service';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Asks for confirmation before leaving a page with unsaved form changes. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return inject(ConfirmService).confirm({
    tone: 'warning',
    title: 'Leave without saving?',
    message: 'You have unsaved changes on this page. They will be lost if you leave now.',
    confirmLabel: 'Leave page',
    cancelLabel: 'Stay',
  });
};

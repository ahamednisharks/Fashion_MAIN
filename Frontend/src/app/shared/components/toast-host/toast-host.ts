import { ChangeDetectionStrategy, Component, ElementRef, effect, inject } from '@angular/core';

import { ToastKind, ToastService } from '../../../core/services/toast.service';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';

const ICONS: Record<ToastKind, IconName> = {
  success: 'check-circle-fill',
  error: 'x-circle-fill',
  info: 'info-circle-fill',
  warning: 'exclamation-triangle-fill',
};

/**
 * Renders ToastService notifications. Uses the Popover API (where supported) so toasts sit in the
 * top layer and stay visible above open modal dialogs.
 */
@Component({
  selector: 'app-toast-host',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './toast-host.scss',
  host: { popover: 'manual', class: 'toast-host', 'aria-live': 'polite' },
  template: `
    @for (toast of toastService.toasts(); track toast.id) {
      <div
        class="toast"
        [class]="'toast toast-' + toast.kind"
        [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
      >
        <app-icon class="toast-icon" [name]="icons[toast.kind]" />
        <p class="toast-message">{{ toast.message }}</p>
        <button
          type="button"
          class="toast-close"
          aria-label="Dismiss notification"
          (click)="toastService.dismiss(toast.id)"
        >
          <app-icon name="x-lg" />
        </button>
      </div>
    }
  `,
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
  protected readonly icons = ICONS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const count = this.toastService.toasts().length;
      const el = this.host.nativeElement;
      if (typeof el.showPopover !== 'function') {
        return;
      }
      // Re-show on every change so the host moves above any dialog opened since.
      if (el.matches(':popover-open')) {
        el.hidePopover();
      }
      if (count > 0) {
        el.showPopover();
      }
    });
  }
}

import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { UserWithTemporaryPassword } from '../../core/models/user.model';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { Modal } from '../../shared/components/modal/modal';

/** Shows a one-time temporary password (after creating a user or resetting a password). */
@Component({
  selector: 'app-temporary-password-dialog',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .temp-password {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 14px 0;
      padding: 12px 14px;
      border: 1px dashed var(--c-border-strong);
      border-radius: var(--radius);
      background: var(--c-surface-2);
    }
    .temp-password-value {
      font-family: var(--font-mono);
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      user-select: all;
      word-break: break-all;
    }
  `,
  template: `
    <app-modal [title]="title()" size="sm" (closed)="closed.emit()">
      <div class="modal-body">
        <p>
          Give this temporary password to <strong>{{ result().user.fullName }}</strong>
          (username <span class="mono">{{ result().user.username }}</span>). They will choose their
          own password the first time they sign in.
        </p>
        <div class="temp-password">
          <span class="temp-password-value" aria-label="Temporary password">{{
            result().temporaryPassword
          }}</span>
          <button type="button" class="btn btn-secondary btn-sm" (click)="copy()">
            <app-icon [name]="copied() ? 'clipboard-check' : 'clipboard'" />
            {{ copied() ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <div class="alert alert-warning" role="note">
          <app-icon name="exclamation-triangle-fill" />
          <span>This password is shown only once. Note it down before closing.</span>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" (click)="closed.emit()">Done</button>
      </div>
    </app-modal>
  `,
})
export class TemporaryPasswordDialog {
  readonly result = input.required<UserWithTemporaryPassword>();
  readonly title = input('Temporary password');
  readonly closed = output<void>();

  private readonly toast = inject(ToastService);
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.result().temporaryPassword);
      this.copied.set(true);
    } catch {
      // Clipboard access needs HTTPS or localhost (not available over plain-HTTP LAN addresses).
      this.toast.warning('Copying is not available here — select the password and copy it.');
    }
  }
}

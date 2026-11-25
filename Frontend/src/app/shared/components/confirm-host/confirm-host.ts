import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ConfirmService } from '../../../core/services/confirm.service';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';
import { Modal } from '../modal/modal';

/** Renders the active ConfirmService request. Place once in the app shell. */
@Component({
  selector: 'app-confirm-host',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './confirm-host.scss',
  template: `
    @if (confirm.current(); as request) {
      <app-modal
        size="sm"
        [title]="request.title"
        [dismissible]="true"
        (closed)="confirm.resolve('cancel')"
      >
        <div class="modal-body confirm-body">
          <span class="confirm-icon" [class]="'confirm-icon tone-' + tone()">
            <app-icon [name]="icon()" />
          </span>
          <p class="confirm-message">{{ request.message }}</p>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            autofocus
            (click)="confirm.resolve('cancel')"
          >
            {{ request.cancelLabel ?? 'Cancel' }}
          </button>
          @if (request.alternateLabel) {
            <button type="button" class="btn btn-secondary" (click)="confirm.resolve('alternate')">
              {{ request.alternateLabel }}
            </button>
          }
          <button
            type="button"
            class="btn"
            [class.btn-danger]="tone() === 'danger'"
            [class.btn-primary]="tone() !== 'danger'"
            (click)="confirm.resolve('confirm')"
          >
            {{ request.confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);

  protected readonly tone = computed(() => this.confirm.current()?.tone ?? 'primary');
  protected readonly icon = computed<IconName>(() => {
    switch (this.tone()) {
      case 'danger':
        return 'trash3';
      case 'warning':
        return 'exclamation-triangle-fill';
      default:
        return 'info-circle-fill';
    }
  });
}

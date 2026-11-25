import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Icon } from '../icon/icon';

/** Cancel / Save buttons for modal forms. Place inside the <form>; the save button submits it. */
@Component({
  selector: 'app-form-footer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'modal-footer' },
  template: `
    <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="cancel.emit()">
      Cancel
    </button>
    <button type="submit" class="btn btn-primary" [disabled]="saving()">
      @if (saving()) {
        <span class="spinner" aria-hidden="true"></span> Saving…
      } @else {
        <app-icon name="check-circle" /> {{ submitLabel() }}
      }
    </button>
  `,
})
export class FormFooter {
  readonly saving = input(false);
  readonly submitLabel = input('Save');
  readonly cancel = output<void>();
}

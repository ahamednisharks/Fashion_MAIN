import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';

/** Friendly placeholder for "no data" / "no results". Projected content renders as actions. */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './state-views.scss',
  template: `
    <span class="state-icon"><app-icon [name]="icon()" /></span>
    <p class="state-title">{{ heading() }}</p>
    @if (message()) {
      <p class="state-message">{{ message() }}</p>
    }
    <div class="state-actions"><ng-content /></div>
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly message = input('');
  readonly icon = input<IconName>('inbox');
}

/** Load failure with a retry action. */
@Component({
  selector: 'app-error-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './state-views.scss',
  host: { role: 'alert', class: 'is-error' },
  template: `
    <span class="state-icon"><app-icon name="cloud-slash" /></span>
    <p class="state-title">{{ heading() }}</p>
    <p class="state-message">{{ message() }}</p>
    <div class="state-actions">
      <button type="button" class="btn btn-secondary btn-sm" (click)="retry.emit()">
        <app-icon name="arrow-clockwise" /> Try again
      </button>
      <ng-content />
    </div>
  `,
})
export class ErrorState {
  readonly heading = input("Couldn't load data");
  readonly message = input('Something went wrong. Please try again.');
  readonly retry = output<void>();
}

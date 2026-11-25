import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EntityStatus } from '../../../core/models/base.model';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge badge-dot" [class.badge-success]="active()" [class.badge-muted]="!active()">
      {{ active() ? 'Active' : 'Inactive' }}
    </span>
  `,
})
export class StatusBadge {
  readonly status = input.required<EntityStatus>();
  protected readonly active = computed(() => this.status() === 'active');
}

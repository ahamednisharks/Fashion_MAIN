import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from '../../shared/components/icon/icon';
import { IconName } from '../../shared/components/icon/icon-registry';

/**
 * Placeholder for modules planned in later phases (Billing, Purchase, Reports).
 * Inputs come from route data via withComponentInputBinding().
 */
@Component({
  selector: 'app-coming-soon-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './placeholder-page.scss',
  template: `
    <section class="card placeholder">
      <span class="placeholder-icon"><app-icon [name]="icon()" /></span>
      <span class="badge badge-info">Coming soon</span>
      <h2>{{ module() }} is planned for a later phase</h2>
      <p class="text-muted">{{ summary() }}</p>
      <div class="placeholder-actions">
        <a routerLink="/dashboard" class="btn btn-secondary">Go to dashboard</a>
        <a routerLink="/masters/products" class="btn btn-primary">Manage products</a>
      </div>
    </section>
  `,
})
export class ComingSoonPage {
  readonly module = input('This module');
  readonly icon = input<IconName>('hourglass-split');
  readonly summary = input('');
}

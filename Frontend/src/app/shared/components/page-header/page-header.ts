import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * In-page header: optional heading + short description on the left, actions (projected) on the
 * right. The main page title and breadcrumb live in the app header.
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page-header.scss',
  template: `
    <div class="page-header-text">
      @if (heading()) {
        <h2 class="page-heading">{{ heading() }}</h2>
      }
      @if (description()) {
        <p class="page-description">{{ description() }}</p>
      }
      <ng-content select="[headerMeta]" />
    </div>
    <div class="page-header-actions">
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  readonly heading = input('');
  readonly description = input('');
}

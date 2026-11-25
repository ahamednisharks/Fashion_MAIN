import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from '../../shared/components/icon/icon';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './placeholder-page.scss',
  template: `
    <section class="card placeholder">
      <span class="placeholder-icon"><app-icon name="exclamation-circle" /></span>
      <h2>Page not found</h2>
      <p class="text-muted">The page you are looking for doesn't exist or may have moved.</p>
      <div class="placeholder-actions">
        <a routerLink="/" class="btn btn-primary">Go to home page</a>
      </div>
    </section>
  `,
})
export class NotFoundPage {}

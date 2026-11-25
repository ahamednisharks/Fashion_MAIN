import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { LayoutService } from '../../services/layout.service';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';

/** Application frame: sidebar + header + routed content (toast/confirm hosts live in App). */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Header],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.scss',
  host: {
    '[class.is-rail]': 'layout.isDesktop() && layout.railCollapsed()',
    '(document:keydown.escape)': 'layout.closeDrawer()',
  },
  template: `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <app-sidebar />
    @if (layout.drawerOpen()) {
      <div class="drawer-backdrop" aria-hidden="true" (click)="layout.closeDrawer()"></div>
    }
    <div class="app-main">
      <app-header />
      <main id="main-content" class="app-content" tabindex="-1">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly layout = inject(LayoutService);

  constructor() {
    // Close the mobile drawer after navigating.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.layout.closeDrawer());
  }
}

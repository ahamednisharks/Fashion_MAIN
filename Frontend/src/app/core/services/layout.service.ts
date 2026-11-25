import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

import { readJson, writeJson } from '../utils/storage';

/** Matches the `lg` breakpoint in src/styles/_mixins.scss. */
const DESKTOP_QUERY = '(min-width: 992px)';
const RAIL_KEY = 'ui.sidebarRail';

/**
 * Sidebar behaviour:
 * - desktop (≥ lg): persistent sidebar that can collapse to an icon rail (remembered);
 * - tablet / phone: off-canvas drawer opened from the header.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery = this.document.defaultView?.matchMedia(DESKTOP_QUERY);

  readonly isDesktop = signal(this.mediaQuery?.matches ?? true);
  readonly drawerOpen = signal(false);
  readonly railCollapsed = signal(readJson<boolean>(RAIL_KEY, false));

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) => {
      this.isDesktop.set(event.matches);
      if (event.matches) {
        this.drawerOpen.set(false);
      }
    });

    effect(() => {
      this.document.documentElement.classList.toggle('nav-open', this.drawerOpen());
    });
  }

  toggleNavigation(): void {
    if (this.isDesktop()) {
      const collapsed = !this.railCollapsed();
      this.railCollapsed.set(collapsed);
      writeJson(RAIL_KEY, collapsed);
    } else {
      this.drawerOpen.update((open) => !open);
    }
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import { Icon } from '../../../shared/components/icon/icon';
import { AuthService } from '../../auth/auth.service';
import { LayoutService } from '../../services/layout.service';
import { NAV_ENTRIES, NavGroup, isNavGroup } from '../nav-items';
import { SidebarBrand } from './sidebar-brand';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon, SidebarBrand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  host: {
    '[class.is-rail]': 'rail()',
    '[class.is-open]': 'layout.drawerOpen()',
  },
})
export class Sidebar {
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly entries = computed(() => {
    const showAdmin = this.auth.enabled && this.auth.isAdmin();
    return NAV_ENTRIES.filter((entry) => !entry.adminOnly || showAdmin).map((entry) =>
      isNavGroup(entry) && !showAdmin
        ? { ...entry, children: entry.children.filter((child) => !child.adminOnly) }
        : entry,
    );
  });
  protected readonly isGroup = isNavGroup;
  protected readonly rail = computed(() => this.layout.isDesktop() && this.layout.railCollapsed());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Groups the user collapsed manually; groups containing the active page always stay open. */
  private readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(group: NavGroup): boolean {
    return this.rail() || this.groupIsActive(group) || !this.collapsedGroups().has(group.label);
  }

  protected groupIsActive(group: NavGroup): boolean {
    const url = this.url();
    return group.children.some((child) => url.startsWith(child.route));
  }

  protected toggleGroup(group: NavGroup): void {
    this.collapsedGroups.update((current) => {
      const next = new Set(current);
      if (this.isExpanded(group)) {
        next.add(group.label);
      } else {
        next.delete(group.label);
      }
      return next;
    });
  }
}

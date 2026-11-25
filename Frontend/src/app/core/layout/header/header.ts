import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Icon } from '../../../shared/components/icon/icon';
import { AuthService } from '../../auth/auth.service';
import { roleLabel } from '../../models/user.model';
import { LayoutService } from '../../services/layout.service';
import { PageMetaService } from '../../services/page-meta.service';
import { ToastService } from '../../services/toast.service';

type HeaderMenu = 'notifications' | 'profile';

/** "Priya Sharma" → "PS", "admin" → "AD". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0].charAt(0) + words[words.length - 1].charAt(0) : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'openMenu.set(null)',
  },
})
export class Header {
  protected readonly layout = inject(LayoutService);
  protected readonly pageMeta = inject(PageMetaService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly openMenu = signal<HeaderMenu | null>(null);

  protected readonly user = computed(() => {
    const user = this.auth.user();
    const name = user?.fullName || user?.username || 'Guest';
    return {
      name,
      username: user?.username ?? '',
      role: user ? roleLabel(user.role) : '',
      initials: initialsOf(name),
    };
  });

  protected toggleMenu(menu: HeaderMenu): void {
    this.openMenu.update((current) => (current === menu ? null : menu));
  }

  protected changePassword(): void {
    this.openMenu.set(null);
    void this.router.navigate(['/account/password'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  protected async logout(): Promise<void> {
    this.openMenu.set(null);
    await this.auth.logout();
    await this.router.navigate(['/login'], { replaceUrl: true });
    this.toast.info('You have been signed out.');
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.openMenu() && !this.host.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ShopSettingsService } from '../../data-access/shop-settings.service';
import { nameInitials } from '../../utils/text';

/** App name shown while the shop has no name. */
export const APP_NAME = 'Fashion';
/** A logo at least this many times wider than tall usually spells out the shop name itself. */
export const WIDE_LOGO_RATIO = 1.8;

/**
 * The shop's brand at the top of the sidebar: its logo (on a white tile, so any logo shows on
 * the dark menu) or, without one, the initials of the shop name, followed by the shop name.
 * A wide logo, which normally contains the name, gets the whole area; in the narrow icon rail
 * it gives way to the initials.
 */
@Component({
  selector: 'app-sidebar-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sidebar-brand.scss',
  host: { '[class.is-rail]': 'rail()' },
  template: `
    @let shop = brand();
    <a
      routerLink="/"
      class="brand-link"
      [attr.aria-label]="shop.name + ' — go to home page'"
      [title]="shop.name"
    >
      @if (shop.showLogo) {
        <span class="brand-logo" [class.is-wide]="shop.wideLogo" aria-hidden="true">
          <img [src]="shop.logo" alt="" />
        </span>
      } @else {
        <span class="brand-mark" [class.is-pair]="shop.initials.length > 1" aria-hidden="true">{{
          shop.initials
        }}</span>
      }
      @if (!shop.wideLogo && !rail()) {
        <span class="brand-text">
          <span class="brand-name">{{ shop.name }}</span>
          <span class="brand-tagline">Dress Shop Manager</span>
        </span>
      }
    </a>
  `,
})
export class SidebarBrand {
  /** The sidebar is the narrow desktop icon rail. */
  readonly rail = input(false);

  private readonly shopSettings = inject(ShopSettingsService);
  /** Width ÷ height of the shop logo (null while unknown or when there is none). */
  private readonly logoRatio = signal<number | null>(null);

  protected readonly brand = computed(() => {
    const shopName = this.shopSettings.profile()?.shopName.trim() ?? '';
    const logo = this.shopSettings.logo();
    const ratio = this.logoRatio();
    const wide = ratio !== null && ratio >= WIDE_LOGO_RATIO;
    const showLogo = !!logo && ratio !== null && !(wide && this.rail());
    return {
      name: shopName || APP_NAME,
      initials: nameInitials(shopName) || APP_NAME.charAt(0),
      logo,
      showLogo,
      wideLogo: showLogo && wide,
    };
  });

  constructor() {
    void this.shopSettings.loadProfile();
    void this.shopSettings.loadLogo();
    // Measure the logo before showing it, so a wide one never flashes in the small tile.
    effect((onCleanup) => {
      const logo = this.shopSettings.logo();
      this.logoRatio.set(null);
      if (!logo) {
        return;
      }
      const image = new Image();
      image.onload = () =>
        this.logoRatio.set(image.naturalWidth / Math.max(1, image.naturalHeight) || 1);
      image.src = logo;
      onCleanup(() => (image.onload = null));
    });
  }
}

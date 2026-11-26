import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { ShopSettingsService } from '../data-access/shop-settings.service';
import { buildThemePalette } from '../theme/theme-palette';
import { ThemeService } from '../theme/theme.service';
import { nameInitials } from '../utils/text';
import { APP_NAME, WIDE_LOGO_RATIO } from './sidebar/sidebar-brand';

/** Sidebar badge colours of the built-in theme (--sidebar-accent / --sidebar-bg in _tokens.scss). */
const DEFAULT_TILE = '#2dd4bf';
const DEFAULT_INK = '#0f1d2b';
const FONT = "system-ui, 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * Keeps the browser-tab icon in step with the sidebar brand, as the narrow icon rail shows it:
 * the shop logo on a white tile, or — without a logo, or with a wide one that would be
 * unreadable in a square — the shop's initials on the theme's accent colour.
 * index.html starts with the same badge for the built-in theme (public/favicon.svg).
 */
@Injectable({ providedIn: 'root' })
export class FaviconService {
  private readonly document = inject(DOCUMENT);
  private readonly settings = inject(ShopSettingsService);
  private readonly theme = inject(ThemeService);
  /** Width ÷ height of the shop logo (null while unknown or when there is none). */
  private readonly logoRatio = signal<number | null>(null);

  /** The icon as an SVG data URL. */
  readonly href = computed(() => {
    const logo = this.settings.logo();
    const ratio = this.logoRatio();
    if (logo && ratio !== null && ratio < WIDE_LOGO_RATIO) {
      return svgDataUrl(logoTile(logo));
    }
    const color = this.theme.color();
    const palette = color ? buildThemePalette(color) : null;
    const initials = nameInitials(this.settings.profile()?.shopName) || APP_NAME.charAt(0);
    return svgDataUrl(
      initialsTile(
        initials,
        palette?.['--sidebar-accent'] ?? DEFAULT_TILE,
        palette?.['--sidebar-bg'] ?? DEFAULT_INK,
      ),
    );
  });

  constructor() {
    // Measure the logo first (as the sidebar does) to know whether it fits a square.
    effect((onCleanup) => {
      const logo = this.settings.logo();
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
    effect(() => this.setIcon(this.href()));
  }

  private setIcon(href: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'icon';
      head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = href;
  }
}

function initialsTile(initials: string, tile: string, ink: string): string {
  // Two initials ("KF") share the square, so they are set smaller.
  const size = [...initials].length > 1 ? 15 : 21;
  return (
    `<rect width="32" height="32" rx="8" fill="${escapeXml(tile)}"/>` +
    `<text x="16" y="16" dominant-baseline="central" text-anchor="middle" font-family="${FONT}" ` +
    `font-size="${size}" font-weight="700" fill="${escapeXml(ink)}">${escapeXml(initials)}</text>`
  );
}

/** The logo fitted inside a white tile, like the sidebar (logos are drawn for paper). */
function logoTile(logo: string): string {
  return (
    '<rect width="32" height="32" rx="6" fill="#fff"/>' +
    `<image href="${escapeXml(logo)}" x="2" y="2" width="28" height="28" preserveAspectRatio="xMidYMid meet"/>`
  );
}

function svgDataUrl(content: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${content}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

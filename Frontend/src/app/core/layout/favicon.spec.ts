import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ShopSettingsService } from '../data-access/shop-settings.service';
import { buildThemePalette } from '../theme/theme-palette';
import { ThemeService } from '../theme/theme.service';
import { FaviconService } from './favicon';

describe('FaviconService', () => {
  const profile = signal<{ shopName: string } | null>(null);
  const logo = signal('');
  const color = signal('');

  /** The SVG behind the tab icon's data URL. */
  const iconSvg = () => {
    const href = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
    return decodeURIComponent(href.replace('data:image/svg+xml,', ''));
  };

  beforeEach(() => {
    profile.set(null);
    logo.set('');
    color.set('');
    document.head.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
    TestBed.configureTestingModule({
      providers: [
        { provide: ShopSettingsService, useValue: { profile, logo } },
        { provide: ThemeService, useValue: { color } },
      ],
    });
    TestBed.inject(FaviconService);
    TestBed.tick();
  });

  it('shows the "F" badge in the built-in colours before the shop is known', () => {
    const svg = iconSvg();
    expect(svg).toContain('>F</text>');
    expect(svg).toContain('fill="#2dd4bf"');
    expect(svg).toContain('fill="#0f1d2b"');
  });

  it("follows the shop's initials and theme colour", () => {
    profile.set({ shopName: 'Kachi Fashions' });
    color.set('#7c3aed');
    TestBed.tick();

    const palette = buildThemePalette('#7c3aed');
    const svg = iconSvg();
    expect(svg).toContain('>KF</text>');
    expect(svg).toContain(`fill="${palette['--sidebar-accent']}"`);
    expect(svg).toContain(`fill="${palette['--sidebar-bg']}"`);
  });

  it('escapes the shop name', () => {
    profile.set({ shopName: '<b> & co' });
    TestBed.tick();

    expect(iconSvg()).not.toContain('<b>');
  });
});

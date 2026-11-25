import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';

import { ShopSettingsService } from '../data-access/shop-settings.service';
import { readJson, writeJson } from '../utils/storage';
import { THEME_VARIABLES, buildThemePalette, normalizeHex } from './theme-palette';

/** Last theme seen in this browser, so the app opens in the shop's colours without a flash. */
const CACHE_KEY = 'theme.color';
/** <meta name="theme-color"> for the built-in theme (the sidebar colour, as in index.html). */
const DEFAULT_BROWSER_COLOR = '#0f1d2b';

/**
 * The app colour theme: one brand colour (usually from the shop logo) that every themed design
 * token is built from, set as CSS custom properties on <html> (overriding _tokens.scss). The
 * shop's choice is stored on the server, so every counter shows the same colours.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settings = inject(ShopSettingsService);
  private readonly document = inject(DOCUMENT);

  private readonly colorState = signal(normalizeHex(readJson<string>(CACHE_KEY, '')));
  /** The theme colour ('#RRGGBB'), or '' for the built-in teal theme. */
  readonly color = this.colorState.asReadonly();

  constructor() {
    this.paint(this.colorState());
  }

  /** Asks the server for the shop's theme and applies it. Never rejects (keeps the last one). */
  async load(): Promise<string> {
    try {
      this.use(await firstValueFrom(this.settings.getTheme()));
    } catch {
      // Server unreachable — keep the colours this browser last saw.
    }
    return this.colorState();
  }

  /** Saves the theme for every counter (administrators only) and applies it here. */
  save(color: string): Observable<string> {
    return this.settings.saveTheme(normalizeHex(color)).pipe(tap((saved) => this.use(saved)));
  }

  /** Shows `color` without saving it; null goes back to the saved theme. */
  preview(color: string | null): void {
    this.paint(color === null ? this.colorState() : normalizeHex(color));
  }

  private use(color: string): void {
    const value = normalizeHex(color);
    this.colorState.set(value);
    writeJson(CACHE_KEY, value);
    this.paint(value);
  }

  private paint(color: string): void {
    const palette = color ? buildThemePalette(color) : null;
    const style = this.document.documentElement.style;
    for (const name of THEME_VARIABLES) {
      if (palette) {
        style.setProperty(name, palette[name]);
      } else {
        style.removeProperty(name);
      }
    }
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', palette?.['--sidebar-bg'] ?? DEFAULT_BROWSER_COLOR);
  }
}

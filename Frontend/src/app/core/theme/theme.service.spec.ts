import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { ShopSettingsService } from '../data-access/shop-settings.service';
import { STORAGE_PREFIX } from '../utils/storage';
import { THEME_VARIABLES, buildThemePalette } from './theme-palette';
import { ThemeService } from './theme.service';

const CACHE = `${STORAGE_PREFIX}theme.color`;

class FakeShopSettings {
  stored = '';
  failGet = false;
  getTheme(): Observable<string> {
    return this.failGet ? throwError(() => new Error('offline')) : of(this.stored);
  }
  saveTheme(color: string): Observable<string> {
    this.stored = color;
    return of(color);
  }
}

describe('ThemeService', () => {
  let settings: FakeShopSettings;
  const root = () => document.documentElement.style;
  const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');

  function create(): ThemeService {
    TestBed.configureTestingModule({
      providers: [{ provide: ShopSettingsService, useValue: settings }],
    });
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    settings = new FakeShopSettings();
    localStorage.clear();
    THEME_VARIABLES.forEach((name) => root().removeProperty(name));
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const tag = document.createElement('meta');
    tag.name = 'theme-color';
    tag.content = '#0f1d2b';
    document.head.append(tag);
  });

  afterEach(() => {
    THEME_VARIABLES.forEach((name) => root().removeProperty(name));
    localStorage.clear();
  });

  it('opens in the colours this browser last saw', () => {
    localStorage.setItem(CACHE, JSON.stringify('#c62828'));
    const theme = create();
    expect(theme.color()).toBe('#C62828');
    expect(root().getPropertyValue('--c-primary')).toBe('#C62828');
    expect(meta()).toBe(buildThemePalette('#C62828')['--sidebar-bg']);
  });

  it("applies the shop's saved theme from the server and remembers it", async () => {
    settings.stored = '#1F2A5A';
    const theme = create();
    expect(root().getPropertyValue('--c-primary')).toBe('');
    await theme.load();
    expect(theme.color()).toBe('#1F2A5A');
    expect(root().getPropertyValue('--sidebar-bg')).toBe(
      buildThemePalette('#1F2A5A')['--sidebar-bg'],
    );
    expect(JSON.parse(localStorage.getItem(CACHE)!)).toBe('#1F2A5A');
  });

  it('keeps the last colours when the server cannot be reached', async () => {
    localStorage.setItem(CACHE, JSON.stringify('#1F2A5A'));
    settings.failGet = true;
    const theme = create();
    await expect(theme.load()).resolves.toBe('#1F2A5A');
    expect(root().getPropertyValue('--c-primary')).toBe('#1F2A5A');
  });

  it('goes back to the built-in colours for an empty theme', async () => {
    localStorage.setItem(CACHE, JSON.stringify('#C62828'));
    const theme = create();
    await new Promise<void>((resolve) => theme.save('').subscribe(() => resolve()));
    expect(theme.color()).toBe('');
    for (const name of THEME_VARIABLES) {
      expect(root().getPropertyValue(name)).toBe('');
    }
    expect(meta()).toBe('#0f1d2b');
  });

  it('previews a colour without saving it', () => {
    const theme = create();
    theme.preview('#D4A017');
    expect(root().getPropertyValue('--c-primary')).toBe(
      buildThemePalette('#D4A017')['--c-primary'],
    );
    expect(theme.color()).toBe('');
    theme.preview(null);
    expect(root().getPropertyValue('--c-primary')).toBe('');
    expect(settings.stored).toBe('');
  });
});

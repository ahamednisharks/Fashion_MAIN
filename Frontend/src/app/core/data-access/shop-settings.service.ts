import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  defer,
  delay,
  firstValueFrom,
  map,
  of,
  tap,
  throwError,
} from 'rxjs';

import { EMPTY_SHOP_PROFILE, ShopProfile } from '../models/shop-profile.model';
import { readJson, writeJson } from '../utils/storage';
import { API_BASE_URL, DATA_SOURCE_MODE } from './data-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

const PROFILE_KEY = 'settings.shopProfile';
const LOGO_KEY = 'settings.shopLogo';
const THEME_KEY = 'settings.shopTheme';

/**
 * Shop profile and logo printed on bills, and the app colour theme. Stored on the server
 * (GET / PUT /settings/shop, /settings/shop/logo and /settings/shop/theme — saving is
 * admin-only); in 'mock' mode they live in this browser's localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ShopSettingsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/settings/shop`;
  private readonly useApi = inject(DATA_SOURCE_MODE) === 'api';

  private readonly logoState = signal('');
  /** The shop logo as an image data URL ('' = none, or not loaded yet — see loadLogo()). */
  readonly logo = this.logoState.asReadonly();
  private logoRequest: Promise<string> | null = null;

  private readonly profileState = signal<ShopProfile | null>(null);
  /** The saved shop profile, once loaded (see loadProfile()); null before that. */
  readonly profile = this.profileState.asReadonly();
  private profileRequest: Promise<ShopProfile | null> | null = null;

  getProfile(): Observable<ShopProfile> {
    const request = this.useApi
      ? this.call<ShopProfile>(this.http.get<unknown>(this.url))
      : defer(() => of(this.localProfile() ?? { ...EMPTY_SHOP_PROFILE }));
    return request.pipe(tap((profile) => this.profileState.set(profile)));
  }

  saveProfile(profile: ShopProfile): Observable<ShopProfile> {
    const request = this.useApi
      ? this.call<ShopProfile>(this.http.put<unknown>(this.url, profile))
      : defer(() => {
          writeJson(PROFILE_KEY, profile);
          return of(profile);
        }).pipe(delay(250));
    return request.pipe(tap((saved) => this.profileState.set(saved)));
  }

  /**
   * Loads the profile into `profile` once per app session (later calls reuse that request).
   * Never rejects — resolves to null if it cannot be loaded, and the next call tries again.
   */
  loadProfile(): Promise<ShopProfile | null> {
    if (!this.profileRequest) {
      const request = firstValueFrom(this.getProfile()).catch(() => {
        if (this.profileRequest === request) {
          this.profileRequest = null;
        }
        return this.profileState();
      });
      this.profileRequest = request;
    }
    return this.profileRequest;
  }

  /**
   * Profile saved in this browser by earlier versions (before it moved to the server), or null.
   * Used once to offer moving it to the server.
   */
  localProfile(): ShopProfile | null {
    const saved = readJson<Partial<ShopProfile> | null>(PROFILE_KEY, null);
    return saved?.shopName ? { ...EMPTY_SHOP_PROFILE, ...saved } : null;
  }

  /**
   * Loads the logo into `logo` once per app session (later calls reuse that request; `refresh`
   * asks the server again). Never rejects — prints simply go without a logo if it fails.
   */
  loadLogo(options: { refresh?: boolean } = {}): Promise<string> {
    if (!this.logoRequest || options.refresh) {
      const request = firstValueFrom(this.fetchLogo()).then(
        (logo) => {
          this.logoState.set(logo);
          return logo;
        },
        () => {
          if (this.logoRequest === request) {
            this.logoRequest = null; // try again next time
          }
          return this.logoState();
        },
      );
      this.logoRequest = request;
    }
    return this.logoRequest;
  }

  /** Uploads a new logo (image data URL); `logo` updates once saved. */
  saveLogo(dataUrl: string): Observable<string> {
    const request = this.useApi
      ? this.call<{ logo: string }>(this.http.put<unknown>(`${this.url}/logo`, { logo: dataUrl }))
      : defer(() => (writeJson(LOGO_KEY, dataUrl) ? of({ logo: dataUrl }) : this.storageFull()));
    return request.pipe(
      map(({ logo }) => logo),
      tap((logo) => this.setLogo(logo)),
    );
  }

  removeLogo(): Observable<void> {
    const request = this.useApi
      ? this.http
          .delete<void>(`${this.url}/logo`)
          .pipe(catchError((error: unknown) => throwError(() => fromHttpError(error))))
      : defer(() => {
          writeJson(LOGO_KEY, '');
          return of(undefined);
        });
    return request.pipe(
      map(() => undefined),
      tap(() => this.setLogo('')),
    );
  }

  /** The shop's theme colour ('#RRGGBB'), or '' for the built-in theme. Readable before sign-in. */
  getTheme(): Observable<string> {
    const request = this.useApi
      ? this.call<{ color: string }>(this.http.get<unknown>(`${this.url}/theme`))
      : defer(() => of({ color: readJson<string>(THEME_KEY, '') }));
    return request.pipe(map(({ color }) => color));
  }

  /** Saves the theme colour for every counter ('' = built-in theme); returns the saved value. */
  saveTheme(color: string): Observable<string> {
    const request = this.useApi
      ? this.call<{ color: string }>(this.http.put<unknown>(`${this.url}/theme`, { color }))
      : defer(() => {
          writeJson(THEME_KEY, color);
          return of({ color });
        });
    return request.pipe(map(({ color: saved }) => saved));
  }

  private fetchLogo(): Observable<string> {
    if (!this.useApi) {
      return defer(() => of(readJson<string>(LOGO_KEY, '')));
    }
    return this.call<{ logo: string }>(this.http.get<unknown>(`${this.url}/logo`)).pipe(
      map(({ logo }) => logo),
    );
  }

  private setLogo(logo: string): void {
    this.logoState.set(logo);
    this.logoRequest = Promise.resolve(logo);
  }

  private storageFull(): Observable<never> {
    return throwError(() => new Error('The logo is too large to keep in this browser.'));
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

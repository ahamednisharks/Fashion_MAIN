import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of, throwError } from 'rxjs';

import { API_BASE_URL, DATA_SOURCE_MODE } from '../data-access/data-source';
import { fromHttpError, unwrapEnvelope } from '../data-access/http/http-errors';
import { AuthUser } from '../models/user.model';

type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';

/** Used when the app runs on in-browser demo data (no backend, no sign-in). */
const DEMO_USER: AuthUser = {
  id: 'demo',
  username: 'demo',
  fullName: 'Demo User',
  role: 'admin',
  mustChangePassword: false,
};

/**
 * The page a user starts on after signing in (and when opening the app root):
 * administrators get the dashboard, staff go straight to the billing counter.
 */
export function homeUrlFor(user: AuthUser | null): string {
  if (!user) {
    return '/login';
  }
  return user.role === 'admin' ? '/dashboard' : '/billing';
}

/**
 * Current user and session actions. The session itself lives in an httpOnly cookie managed by
 * the backend, so the browser code never sees the token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/auth`;

  /** False in 'mock' mode — everything is allowed for the demo user. */
  readonly enabled = inject(DATA_SOURCE_MODE) === 'api';

  private readonly status = signal<AuthStatus>(this.enabled ? 'unknown' : 'signed-in');
  private readonly current = signal<AuthUser | null>(this.enabled ? null : DEMO_USER);
  private pending: Promise<AuthUser | null> | null = null;

  readonly user = this.current.asReadonly();
  readonly isSignedIn = computed(() => this.status() === 'signed-in');
  readonly isAdmin = computed(() => this.current()?.role === 'admin');

  /** Resolves the signed-in user (asks the server once, then answers from memory). */
  ensureLoaded(): Promise<AuthUser | null> {
    if (this.status() !== 'unknown') {
      return Promise.resolve(this.current());
    }
    this.pending ??= firstValueFrom(
      this.http.get<unknown>(`${this.baseUrl}/me`).pipe(
        map((response) => unwrapEnvelope<AuthUser>(response)),
        // Not signed in (401) or server unreachable: show the sign-in page either way.
        catchError(() => of(null)),
      ),
    ).then((user) => {
      this.pending = null;
      this.setUser(user);
      return user;
    });
    return this.pending;
  }

  login(username: string, password: string, remember: boolean): Observable<AuthUser> {
    return this.post<AuthUser>('/login', { username, password, remember }).pipe(
      map((user) => {
        this.setUser(user);
        return user;
      }),
    );
  }

  /** Ends the session on the server; the local state is cleared even if that request fails. */
  async logout(): Promise<void> {
    if (this.enabled) {
      await firstValueFrom(this.post<unknown>('/logout', {})).catch(() => undefined);
      this.setUser(null);
    }
  }

  changePassword(currentPassword: string, newPassword: string): Observable<AuthUser> {
    return this.post<AuthUser>('/change-password', { currentPassword, newPassword }).pipe(
      map((user) => {
        this.setUser(user);
        return user;
      }),
    );
  }

  /** Called when the API reports that the session is gone. */
  sessionEnded(): void {
    if (this.enabled) {
      this.setUser(null);
    }
  }

  private setUser(user: AuthUser | null): void {
    this.current.set(user);
    this.status.set(user ? 'signed-in' : 'signed-out');
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<unknown>(`${this.baseUrl}${path}`, body).pipe(
      map((response) => (response === null ? (undefined as T) : unwrapEnvelope<T>(response))),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

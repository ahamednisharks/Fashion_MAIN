import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { EntityStatus } from '../models/base.model';
import {
  AppUser,
  UserCreateInput,
  UserUpdateInput,
  UserWithTemporaryPassword,
} from '../models/user.model';
import { ListQuery, PagedResult } from './api.types';
import { API_BASE_URL } from './data-source';
import { listParams } from './http/http-crud-source';
import { fromHttpError, unwrapEnvelope } from './http/http-errors';

/**
 * Staff accounts (administrators only) — REST API at /users.
 * Creating an account or resetting a password returns a one-time temporary password.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/users`;

  list(query: ListQuery): Observable<PagedResult<AppUser>> {
    return this.call(this.http.get<unknown>(this.url, { params: listParams(query) }));
  }

  /** True when another account already uses this username (case-insensitive). */
  isTaken(username: string, excludeId?: string): Observable<boolean> {
    let params = new HttpParams().set('field', 'username').set('value', username);
    if (excludeId) {
      params = params.set('excludeId', excludeId);
    }
    return this.call<{ exists: boolean }>(
      this.http.get<unknown>(`${this.url}/exists`, { params }),
    ).pipe(map((result) => result.exists));
  }

  create(input: UserCreateInput): Observable<UserWithTemporaryPassword> {
    return this.call(this.http.post<unknown>(this.url, input));
  }

  update(id: string, input: UserUpdateInput): Observable<AppUser> {
    return this.call(this.http.put<unknown>(this.itemUrl(id), input));
  }

  setStatus(id: string, status: EntityStatus): Observable<AppUser> {
    return this.call(this.http.patch<unknown>(`${this.itemUrl(id)}/status`, { status }));
  }

  /** Issues a new temporary password and signs the user out everywhere. */
  resetPassword(id: string): Observable<UserWithTemporaryPassword> {
    return this.call(this.http.post<unknown>(`${this.itemUrl(id)}/reset-password`, {}));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.itemUrl(id)).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }

  private itemUrl(id: string): string {
    return `${this.url}/${encodeURIComponent(id)}`;
  }

  private call<T>(request: Observable<unknown>): Observable<T> {
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

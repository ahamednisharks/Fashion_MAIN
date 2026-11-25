import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { API_BASE_URL } from '../data-source';
import { fromHttpError, unwrapEnvelope } from './http-errors';

export interface ApiHealth {
  status: 'ok';
  database: 'up';
  uptimeSeconds: number;
  timestamp: string;
}

/** Backend status (GET /health) — shown on the Settings page. */
@Injectable({ providedIn: 'root' })
export class ApiHealthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  check(): Observable<ApiHealth> {
    return this.http.get<{ data: ApiHealth }>(`${this.baseUrl}/health`).pipe(
      map((response) => unwrapEnvelope<ApiHealth>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { ToastService } from '../services/toast.service';
import { AuthService } from './auth.service';

const RETRIED = 'X-Fashion-Retried';

function apiErrorCode(error: HttpErrorResponse): string | undefined {
  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const inner = (body as { error: unknown }).error;
    if (typeof inner === 'object' && inner !== null && 'code' in inner) {
      const code = (inner as { code: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
  }
  return undefined;
}

/** The sign-in endpoints report their own 401s (wrong password, not signed in yet). */
function isAuthEndpoint(url: string): boolean {
  return /\/auth\/(login|logout|me)$/.test(url.split('?')[0] ?? '');
}

/**
 * Reacts to session problems reported by the API:
 * - 401 → the session ended: clear the user and go to the sign-in page (keeping the page);
 * - 403 PASSWORD_CHANGE_REQUIRED → go to the change-password page;
 * - 403 CSRF_FAILED → the server just issued a fresh token cookie: retry once with it.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const xsrf = inject(HttpXsrfTokenExtractor);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !auth.enabled) {
        return throwError(() => error);
      }
      const code = apiErrorCode(error);

      if (code === 'CSRF_FAILED' && !request.headers.has(RETRIED)) {
        const token = xsrf.getToken();
        if (token) {
          return next(request.clone({ setHeaders: { 'X-XSRF-TOKEN': token, [RETRIED]: '1' } }));
        }
      }

      if (error.status === 401 && !isAuthEndpoint(request.url)) {
        const wasSignedIn = auth.isSignedIn();
        auth.sessionEnded();
        if (wasSignedIn) {
          toast.info('Your session has ended. Please sign in again.');
        }
        const returnUrl = router.url.startsWith('/login') ? undefined : router.url;
        void router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
      }

      if (code === 'PASSWORD_CHANGE_REQUIRED' && !router.url.startsWith('/account/password')) {
        const returnUrl = router.url.startsWith('/login') ? undefined : router.url;
        void router.navigate(['/account/password'], {
          queryParams: returnUrl ? { returnUrl } : {},
        });
      }
      return throwError(() => error);
    }),
  );
};

import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { ToastService } from '../services/toast.service';
import { AuthService, homeUrlFor } from './auth.service';

// NOTE: these guards are async. `inject()` only works before the first `await` (while still in
// the injection context), so every dependency is injected up front.

/**
 * Only internal app paths are accepted as return URLs (prevents open redirects and loops back to
 * the sign-in pages). Anything else falls back to `fallback` — normally the user's home page.
 */
export function safeReturnUrl(value: string | null | undefined, fallback: string): string {
  return value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !value.startsWith('/login') &&
    !value.startsWith('/account/password')
    ? value
    : fallback;
}

function toLogin(router: Router, returnUrl: string): UrlTree {
  return router.createUrlTree(['/login'], {
    queryParams: returnUrl && returnUrl !== '/' ? { returnUrl } : {},
  });
}

/** App pages: requires a signed-in user who has replaced any temporary password. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const user = await auth.ensureLoaded();
  if (!user) {
    return toLogin(router, state.url);
  }
  if (user.mustChangePassword) {
    return router.createUrlTree(['/account/password'], {
      queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
    });
  }
  return true;
};

/** App root ("/"): sends each user to their home page — dashboard for admins, billing for staff. */
export const homeRedirectGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const user = await auth.ensureLoaded();
  return router.parseUrl(homeUrlFor(user));
};

/** Change-password page: any signed-in user. */
export const signedInGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const user = await auth.ensureLoaded();
  return user ? true : toLogin(router, state.url);
};

/** Sign-in page: skip it when already signed in. */
export const guestGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const user = auth.enabled ? await auth.ensureLoaded() : auth.user();
  if (!user) {
    return true;
  }
  const returnUrl = route.queryParamMap.get('returnUrl');
  if (user.mustChangePassword) {
    return router.createUrlTree(['/account/password'], {
      queryParams: returnUrl ? { returnUrl } : {},
    });
  }
  return router.parseUrl(safeReturnUrl(returnUrl, homeUrlFor(user)));
};

/** Administrator-only pages. */
export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const user = await auth.ensureLoaded();
  if (auth.enabled && auth.isAdmin()) {
    return true;
  }
  toast.warning('Only administrators can open that page.');
  return router.parseUrl(homeUrlFor(user));
};

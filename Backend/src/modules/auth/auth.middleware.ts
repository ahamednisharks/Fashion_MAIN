import type { CookieOptions, Request, RequestHandler, Response } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import type { AccessGuard } from '../../common/http/route.js';
import { parseCookies } from '../../common/utils/cookies.js';
import { env } from '../../config/env.js';
import { type AuthContext, authService } from './auth.service.js';

/** httpOnly cookie holding the opaque session token. */
export const SESSION_COOKIE = 'fashion_session';

function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.auth.cookieSecure, path: '/' };
}

export function sessionToken(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

/** Persistent sessions get an expiring cookie; others end when the browser closes. */
export function setSessionCookie(res: Response, token: string, persistent: boolean, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, persistent ? { ...cookieOptions(), expires: expiresAt } : cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** The authenticated context of the current request (set by requireAccess). */
export function currentAuth(res: Response): AuthContext {
  const auth: unknown = res.locals['auth'];
  if (!auth) {
    throw AppError.unauthenticated();
  }
  return auth as AuthContext;
}

/**
 * Route guard used by createApiRouter for non-public routes:
 * 401 without a valid session, 403 PASSWORD_CHANGE_REQUIRED while a temporary password is in
 * use (except on routes that allow it), 403 FORBIDDEN for admin-only routes.
 */
export const requireAccess: AccessGuard = (access, allowPendingPasswordChange): RequestHandler => {
  return async (req, res, next) => {
    const token = sessionToken(req);
    const auth = token ? await authService.authenticate(token) : null;
    if (!token || !auth) {
      if (token) {
        clearSessionCookie(res);
      }
      throw AppError.unauthenticated('Your session has ended. Please sign in again.');
    }
    if (auth.refreshed && auth.persistent) {
      setSessionCookie(res, token, true, auth.expiresAt);
    }
    if (auth.user.mustChangePassword && !allowPendingPasswordChange) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please change your password to continue.');
    }
    if (access === 'admin' && auth.user.role !== 'admin') {
      throw AppError.forbidden('Only administrators can do this.');
    }
    res.locals['auth'] = auth;
    next();
  };
};

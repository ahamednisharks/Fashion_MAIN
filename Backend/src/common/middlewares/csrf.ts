import { randomBytes } from 'node:crypto';

import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import { parseCookies, safeEqual } from '../utils/cookies.js';

/** Names Angular's HttpClient uses by default for XSRF protection. */
export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'x-xsrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection for cookie-authenticated requests.
 * - Every response ensures the readable `XSRF-TOKEN` cookie exists.
 * - State-changing requests must echo it in the `X-XSRF-TOKEN` header. A page on another site
 *   cannot read the cookie, so it cannot forge the header.
 * Angular's HttpClient sends the header automatically for same-origin requests.
 */
export function csrfProtection(options: { secure: boolean }): RequestHandler {
  return (req, res, next) => {
    const cookieToken = parseCookies(req.headers.cookie)[XSRF_COOKIE];
    if (!cookieToken) {
      res.cookie(XSRF_COOKIE, randomBytes(24).toString('base64url'), {
        httpOnly: false,
        sameSite: 'lax',
        secure: options.secure,
        path: '/',
      });
    }
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const headerToken = req.get(XSRF_HEADER);
    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      next(
        new AppError(
          403,
          'CSRF_FAILED',
          'Security token missing or expired. Refresh the page and try again.',
        ),
      );
      return;
    }
    next();
  };
}

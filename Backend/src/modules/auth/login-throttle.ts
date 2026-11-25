import { AppError } from '../../common/errors/app-error.js';

/**
 * Per-IP limit on failed sign-ins (complements the per-account lockout stored in the database).
 * In-memory: fine for a single API instance; use a shared store if the API is scaled out.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_IP = 30;

const failures = new Map<string, { count: number; resetAt: number }>();

export function assertLoginAllowed(ip: string): void {
  const entry = failures.get(ip);
  if (entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILURES_PER_IP) {
    throw new AppError(
      429,
      'TOO_MANY_REQUESTS',
      'Too many failed sign-in attempts from this device. Please wait 15 minutes and try again.',
    );
  }
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
  // Keep the map small.
  if (failures.size > 10_000) {
    for (const [key, value] of failures) {
      if (value.resetAt <= now) failures.delete(key);
    }
  }
}

export function clearLoginFailures(ip: string): void {
  failures.delete(ip);
}

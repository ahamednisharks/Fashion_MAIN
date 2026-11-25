/**
 * Thin, failure-tolerant wrapper around localStorage.
 * Storage can be unavailable (private browsing, blocked site data, quota), so every access is guarded
 * and callers always receive a usable fallback.
 */
export const STORAGE_PREFIX = 'fashion.';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKeys(predicate: (key: string) => boolean): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX) && predicate(key.slice(STORAGE_PREFIX.length))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable — nothing to remove.
  }
}

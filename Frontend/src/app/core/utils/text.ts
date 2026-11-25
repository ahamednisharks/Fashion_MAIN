/** Trims and collapses internal whitespace. */
export function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalised key used for case-insensitive uniqueness checks and search. */
export function normalizeKey(value: unknown): string {
  return cleanText(value == null ? '' : String(value)).toLowerCase();
}

/** Safely reads a property from an object by name (used by generic filtering/sorting). */
export function fieldValue(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

/** Natural, case-insensitive comparison for mixed values (numbers before text, empty last). */
export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) {
    return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Up to two letters for a name's badge: the first letters of its first two words.
 * "Kachi Fashions" → "KF", "Sri Lakshmi Silks" → "SL", "kalaa" → "K", "" → "".
 */
export function nameInitials(name: string | null | undefined): string {
  return cleanText(name)
    .split(' ')
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join('');
}

export function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** "1 product" / "3 products" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

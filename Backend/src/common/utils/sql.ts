/**
 * Collects positional parameters ($1, $2, …) while composing a SQL statement, so values are
 * always bound by the driver and never concatenated into SQL text.
 */
export class SqlParams {
  readonly values: unknown[] = [];

  /** Adds a value and returns its placeholder. */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Splits a search string into at most `max` words. */
export function searchTokens(search: string, max = 8): string[] {
  return search.trim().split(/\s+/).filter(Boolean).slice(0, max);
}

/**
 * Builds "every word must appear" conditions. `matchSql` receives a placeholder bound to
 * '%word%' and returns a boolean SQL expression, e.g. p => `concat_ws(' ', c.name) ILIKE ${p}`.
 */
export function searchConditions(
  params: SqlParams,
  search: string,
  matchSql: (placeholder: string) => string,
): string[] {
  return searchTokens(search).map((token) => `(${matchSql(params.add(`%${escapeLike(token)}%`))})`);
}

export function whereClause(conditions: readonly string[]): string {
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

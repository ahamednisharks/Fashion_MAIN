/**
 * Builds an ORDER BY clause from an allowlisted sort map (API field → SQL expression).
 * Unknown fields fall back to the default order; a tiebreaker keeps pagination stable.
 */
export function orderByClause(options: {
  sortBy: string | undefined;
  sortOrder: 'asc' | 'desc';
  sortable: Readonly<Record<string, string>>;
  defaultOrder: string;
  tiebreaker: string;
}): string {
  const expression = options.sortBy ? options.sortable[options.sortBy] : undefined;
  if (!expression) {
    return `ORDER BY ${options.defaultOrder}, ${options.tiebreaker}`;
  }
  const direction = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${expression} ${direction} NULLS LAST, ${options.tiebreaker}`;
}

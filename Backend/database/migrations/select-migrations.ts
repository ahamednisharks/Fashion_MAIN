/*
 * Picks migration files by the name or number typed on the command line, so one screen's
 * tables can be added on their own:
 *
 *   npm run migrate purchase-entry     → 007_purchase_entries.sql
 *   npm run migrate 7                  → 007_purchase_entries.sql
 *   npm run migrate barcode-assign     → 005_barcodes.sql (screen name, see SCREEN_NAMES)
 *
 * A name matches a file when every word of it is a word of the file name (singular or plural,
 * "-", "_" or spaces between words). A name matching several files is refused as ambiguous.
 */

export const MIGRATION_FILE_PATTERN = /^(\d{3,})_[a-z0-9_-]+\.sql$/i;

/** Screen names that differ from the migration file name → migration number. */
export const SCREEN_NAMES: Readonly<Record<string, number>> = {
  masters: 1,
  categories: 1,
  brands: 1,
  sizes: 1,
  colors: 1,
  suppliers: 1,
  customers: 1,
  products: 1,
  login: 2,
  users: 2,
  sales: 3,
  bills: 3,
  po: 4,
  items: 5,
  'barcode-assign': 5,
  labels: 5,
  pe: 7,
  inventory: 8,
  adj: 9,
  'opening-stock': 9,
  'colour-theme': 10,
  'color-theme': 10,
};

export function migrationVersion(file: string): string {
  return MIGRATION_FILE_PATTERN.exec(file)?.[1] ?? file;
}

/** "007_purchase_entries.sql" → "purchase-entries" */
export function migrationName(file: string): string {
  return file
    .replace(/\.sql$/i, '')
    .replace(/^\d+_/, '')
    .replace(/_/g, '-')
    .toLowerCase();
}

/** entries → entry, orders → order, barcodes → barcode (glass stays glass). */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(singular);
}

function describe(files: readonly string[]): string {
  return files.map((file) => `${migrationVersion(file)} ${migrationName(file)}`).join(', ');
}

/**
 * The files the requests name, in file order (each once). Throws an Error that lists the
 * migrations when a request matches none, or several.
 */
export function selectMigrations(files: readonly string[], requests: readonly string[]): string[] {
  const chosen = new Set<string>();
  for (const raw of requests) {
    const request = raw.trim().toLowerCase();
    if (!request) continue;
    chosen.add(matchOne(files, request));
  }
  return files.filter((file) => chosen.has(file));
}

function matchOne(files: readonly string[], request: string): string {
  const byNumber = (wanted: number) =>
    files.filter((file) => Number(migrationVersion(file)) === wanted);

  const screen = SCREEN_NAMES[request.replace(/[\s_]+/g, '-')];
  let matches: string[];
  if (/^\d+$/.test(request)) {
    matches = byNumber(Number(request));
  } else if (screen !== undefined) {
    matches = byNumber(screen);
  } else {
    const wanted = words(request);
    const candidates = files.map((file) => ({ file, words: words(migrationName(file)) }));
    // An exact name wins over files that merely contain the words.
    const exact = candidates.filter(
      (candidate) =>
        candidate.words.length === wanted.length &&
        wanted.every((word) => candidate.words.includes(word)),
    );
    matches = (
      exact.length
        ? exact
        : candidates.filter((candidate) => wanted.every((word) => candidate.words.includes(word)))
    ).map((candidate) => candidate.file);
  }

  if (matches.length === 1) {
    return matches[0];
  }
  if (!matches.length) {
    throw new Error(`No migration matches "${request}". Migrations: ${describe(files)}.`);
  }
  throw new Error(`"${request}" matches ${describe(matches)} — use the full name or the number.`);
}

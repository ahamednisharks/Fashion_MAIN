import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../../src/common/utils/logger.js';
import { type Queryable, closeDatabase, pool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { ensureInitialAdmin, initialAdminMessage } from '../initial-admin.js';
import { isMainModule, projectPath } from '../paths.js';
import {
  MIGRATION_FILE_PATTERN,
  migrationName,
  migrationVersion,
  selectMigrations,
} from './select-migrations.js';

/** Arbitrary, project-specific key so concurrent runners wait for each other. */
const MIGRATION_LOCK_KEY = 7_270_001;

export interface MigrationOptions {
  /**
   * Apply only these migrations — numbers or names as typed, e.g. ['purchase-entry'] or ['7']
   * (see select-migrations.ts). Default: every pending migration.
   */
  readonly only?: readonly string[];
}

export interface MigrationResult {
  readonly applied: string[];
  readonly upToDate: string[];
  /** Migrations still pending after this run (only when `only` was given). */
  readonly stillPending: string[];
  /** True when the default admin login was created (empty users table). */
  adminCreated: boolean;
}

export interface MigrationStatus {
  readonly file: string;
  readonly name: string;
  /** null = pending. */
  readonly appliedAt: Date | null;
  /** The file was edited after it was applied. */
  readonly changed: boolean;
}

function checksum(sql: string): string {
  // Normalise line endings so Git's autocrlf setting doesn't change the checksum.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

const migrationsDir = () => projectPath('database', 'migrations');

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDir()))
    .filter((file) => MIGRATION_FILE_PATTERN.test(file))
    .sort();
}

async function tableExists(db: Queryable, table: string): Promise<boolean> {
  const result = await db.query<{ found: boolean }>('SELECT to_regclass($1) IS NOT NULL AS found', [
    `public.${table}`,
  ]);
  return result.rows[0]?.found ?? false;
}

/**
 * Applies pending `database/migrations/NNN_name.sql` files in order — all of them, or only the
 * ones named in `options.only` (e.g. one screen's tables). Each file runs in its own transaction
 * and is recorded in `schema_migrations`. Already-applied files must not be edited (checksum
 * mismatch aborts the run). Afterwards, a new installation gets the default admin login
 * (see ../initial-admin.ts).
 */
export async function runMigrations(options: MigrationOptions = {}): Promise<MigrationResult> {
  const files = await migrationFiles();
  // Unknown or ambiguous names are refused before touching the database.
  const selective = !!options.only?.length;
  const targets = selective ? selectMigrations(files, options.only ?? []) : files;
  const result: MigrationResult = {
    applied: [],
    upToDate: [],
    stillPending: [],
    adminCreated: false,
  };

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text        PRIMARY KEY,
        name       text        NOT NULL,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((row) => [row.version, row.checksum]));
    const isApplied = (file: string) =>
      applied.has(migrationVersion(file)) || result.applied.includes(file);

    for (const file of targets) {
      const version = migrationVersion(file);
      const sql = await readFile(path.join(migrationsDir(), file), 'utf8');
      const sum = checksum(sql);
      const recorded = applied.get(version);

      if (recorded) {
        if (recorded !== sum) {
          throw new Error(
            `Migration ${file} has changed since it was applied. Create a new migration instead of editing an applied one.`,
          );
        }
        result.upToDate.push(file);
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [version, file, sum],
        );
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const reason = error instanceof Error ? error.message : String(error);
        // Run on its own, a migration may need tables of earlier ones that are still pending.
        const earlier = files.filter((other) => other < file && !isApplied(other));
        const hint = earlier.length
          ? ` Earlier migrations are not applied yet (${earlier.join(', ')}) and this one may ` +
            'need them: apply them first, or run `npm run migrate` to apply everything in order.'
          : '';
        throw new Error(`Migration ${file} failed and was rolled back: ${reason}.${hint}`, {
          cause: error,
        });
      }
    }

    if (selective) {
      result.stillPending.push(...files.filter((file) => !isApplied(file)));
    }
    // Still under the advisory lock, so concurrent runners cannot both create the admin.
    // (Skipped when only some migrations were applied and the users table is not there yet.)
    if (await tableExists(client, 'users')) {
      result.adminCreated = await ensureInitialAdmin(client);
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
  return result;
}

/** Every migration file with when it was applied (null = pending). */
export async function migrationStatus(): Promise<MigrationStatus[]> {
  const files = await migrationFiles();
  const recorded = new Map<string, { appliedAt: Date; checksum: string }>();
  if (await tableExists(pool, 'schema_migrations')) {
    const { rows } = await pool.query<{ version: string; appliedAt: Date; checksum: string }>(
      'SELECT version, applied_at AS "appliedAt", checksum FROM schema_migrations',
    );
    for (const row of rows) recorded.set(row.version, row);
  }
  const statuses: MigrationStatus[] = [];
  for (const file of files) {
    const row = recorded.get(migrationVersion(file));
    const sql = row ? await readFile(path.join(migrationsDir(), file), 'utf8') : '';
    statuses.push({
      file,
      name: migrationName(file),
      appliedAt: row?.appliedAt ?? null,
      changed: !!row && row.checksum !== checksum(sql),
    });
  }
  return statuses;
}

const USAGE = `Usage:
  npm run migrate                     apply every pending migration (in order)
  npm run migrate <name|number> ...   apply only these, e.g. "npm run migrate purchase-entry"
                                      or "npm run migrate 7" (several: "purchase-order purchase-entry")
  npm run migrate status              list the migrations and whether they are applied`;

async function printStatus(): Promise<void> {
  const statuses = await migrationStatus();
  logger.info(`Database "${env.db.database}" — migrations:`);
  for (const status of statuses) {
    const state = status.appliedAt
      ? `applied ${status.appliedAt.toISOString().slice(0, 16).replace('T', ' ')}` +
        (status.changed ? ' (FILE CHANGED SINCE)' : '')
      : 'PENDING';
    logger.info(`  ${migrationVersion(status.file)}  ${status.name.padEnd(20)} ${state}`);
  }
  const pending = statuses.filter((status) => !status.appliedAt);
  if (pending.length) {
    logger.info(
      `${pending.length} pending — apply one with "npm run migrate <name>" (e.g. ` +
        `"npm run migrate ${pending[0].name}") or all with "npm run migrate".`,
    );
  }
}

async function migrateFromCommandLine(args: readonly string[]): Promise<void> {
  const { applied, upToDate, stillPending, adminCreated } = await runMigrations({ only: args });
  if (args.length) {
    applied.forEach((file) => logger.info(`Database "${env.db.database}": applied ${file}`));
    upToDate.forEach((file) =>
      logger.info(`Database "${env.db.database}": ${file} was already applied — nothing to do.`),
    );
    if (stillPending.length) {
      logger.warn(
        `Not applied (not asked for): ${stillPending.join(', ')}. ` +
          'Run "npm run migrate" to apply everything.',
      );
    }
  } else {
    logger.info(
      `Database "${env.db.database}": ${applied.length} migration(s) applied, ${upToDate.length} already up to date.`,
    );
    applied.forEach((file) => logger.info(`  applied ${file}`));
  }
  if (adminCreated) {
    logger.info(initialAdminMessage());
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg.trim());
  const command = args[0]?.toLowerCase();
  const task =
    command === 'help' || command === '--help' || command === '-h'
      ? Promise.resolve(logger.info(USAGE))
      : command === 'status' || command === 'list'
        ? printStatus()
        : migrateFromCommandLine(args);
  task
    .catch((error: unknown) => {
      // The message says what went wrong (and what to run); a stack trace would only add noise.
      logger.error(error instanceof Error ? error.message : `Migration failed: ${String(error)}`);
      process.exitCode = 1;
    })
    .finally(() => closeDatabase());
}

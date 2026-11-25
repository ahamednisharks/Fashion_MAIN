import pg from 'pg';

import { logger } from '../src/common/utils/logger.js';
import { dbCredentialsHint, env } from '../src/config/env.js';
import { isMainModule } from './paths.js';

/**
 * Creates the configured database if it does not exist yet, by connecting to the
 * `postgres` maintenance database with the same credentials.
 * Resolves true when the database was created.
 */
export async function ensureDatabase(name: string = env.db.database): Promise<boolean> {
  // `name` is validated in env.ts (letters, digits, underscore) — identifiers cannot be
  // passed as query parameters, so it is quoted explicitly here.
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Invalid database name "${name}".`);
  }
  const admin = new pg.Client({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: 'postgres',
    ssl: env.db.ssl,
  });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount) {
      return false;
    }
    await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8'`);
    return true;
  } finally {
    await admin.end();
  }
}

if (isMainModule(import.meta.url)) {
  ensureDatabase()
    .then((created) =>
      logger.info(
        created
          ? `Database "${env.db.database}" created.`
          : `Database "${env.db.database}" already exists.`,
      ),
    )
    .catch((error: unknown) => {
      logger.error(
        `Could not create database "${env.db.database}". Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD in .env.${dbCredentialsHint()}`,
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    });
}

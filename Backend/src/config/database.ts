import pg from 'pg';

import { logger } from '../common/utils/logger.js';
import { env } from './env.js';

const { Pool, types } = pg;

// NUMERIC columns hold money (NUMERIC(12,2)) and GST rates — safely representable as JS numbers.
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));
// COUNT(*) returns BIGINT; master-data counts always fit in a JS number.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: env.db.poolMax,
  ssl: env.db.ssl,
  application_name: 'fashion-api',
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => logger.error('Unexpected error on idle PostgreSQL client', error));

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = pg.Pool | pg.PoolClient;
export type TransactionClient = pg.PoolClient;

/**
 * Runs `work` inside a transaction on a dedicated client.
 * Commits when it resolves, rolls back when it throws.
 */
export async function withTransaction<T>(
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

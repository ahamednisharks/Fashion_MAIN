import type { Server } from 'node:http';

import { createApp } from './app.js';
import { logger } from './common/utils/logger.js';
import { checkDatabaseConnection, closeDatabase, pool } from './config/database.js';
import { dbCredentialsHint, env } from './config/env.js';

async function verifyDatabase(): Promise<void> {
  const { host, port, database, user } = env.db;
  try {
    await checkDatabaseConnection();
  } catch (error) {
    logger.error(
      `Cannot connect to PostgreSQL at ${host}:${port}/${database} as "${user}". ` +
        `Check the DB_* settings in .env and run "npm run db:setup" for a new database.${dbCredentialsHint()}`,
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
  const { rows } = await pool.query<{ table: string | null }>(
    "SELECT to_regclass('public.schema_migrations')::text AS table",
  );
  if (!rows[0]?.table) {
    logger.warn(
      'Database has no schema yet — run "npm run db:migrate" (and "npm run db:seed" for demo data).',
    );
  }
  logger.info(`Connected to PostgreSQL ${host}:${port}/${database}`);
}

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

async function main(): Promise<void> {
  await verifyDatabase();
  const server = await listen(env.port);
  logger.info(
    `Fashion API listening on http://localhost:${env.port} (docs: http://localhost:${env.port}/api/docs)`,
  );

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`${signal} received — shutting down…`);
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      closeDatabase()
        .catch((error: unknown) => logger.error('Error closing database pool', error))
        .finally(() => {
          clearTimeout(force);
          process.exit(0);
        });
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
    logger.error(`Port ${env.port} is already in use. Set a different PORT in .env.`);
  }
  void closeDatabase().finally(() => process.exit(1));
});

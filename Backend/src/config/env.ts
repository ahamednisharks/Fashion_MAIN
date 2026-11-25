import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Values already present in the environment take precedence over .env.
loadDotenv({ quiet: true });

const booleanish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((value) => value === 'true' || value === '1' || value === 'yes');

/** PostgreSQL identifier rule — used because database names cannot be bound as query parameters. */
const databaseName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, 'must contain only letters, digits and underscores');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_REQUESTS: booleanish.default(true),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_USER: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: databaseName.default('fashion'),
  TEST_DB_NAME: databaseName.optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL: booleanish.default(false),
  /** CA certificate file (PEM) the database server's certificate is checked against, e.g. Aiven's ca.pem. */
  DB_SSL_CA: z.string().trim().default(''),

  /** Session lifetime after the last request (sliding), in hours. */
  SESSION_IDLE_HOURS: z.coerce.number().min(0.25).max(168).default(12),
  /** Lifetime of "Keep me signed in" sessions (sliding), in days. */
  SESSION_REMEMBER_DAYS: z.coerce.number().min(1).max(365).default(30),
  /** Send cookies only over HTTPS. Defaults to true in production. */
  COOKIE_SECURE: booleanish.optional(),
  /** Password for the default admin login created by `npm run db:migrate` (default admin@123; must be changed at first sign-in). */
  ADMIN_INITIAL_PASSWORD: z.string().min(8).max(128).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const values = parsed.data;
  const isTest = values.NODE_ENV === 'test';
  return {
    nodeEnv: values.NODE_ENV,
    isTest,
    isProduction: values.NODE_ENV === 'production',
    port: values.PORT,
    corsOrigins: values.CORS_ORIGINS,
    logRequests: values.LOG_REQUESTS && !isTest,
    db: {
      host: values.DB_HOST,
      port: values.DB_PORT,
      user: values.DB_USER,
      password: values.DB_PASSWORD,
      // Tests always run against a separate database so development data is never touched.
      database: isTest ? (values.TEST_DB_NAME ?? `${values.DB_NAME}_test`) : values.DB_NAME,
      poolMax: values.DB_POOL_MAX,
      ssl: values.DB_SSL ? sslOptions(values.DB_SSL_CA) : undefined,
    },
    auth: {
      sessionIdleMs: values.SESSION_IDLE_HOURS * 3_600_000,
      sessionRememberMs: values.SESSION_REMEMBER_DAYS * 86_400_000,
      cookieSecure: values.COOKIE_SECURE ?? values.NODE_ENV === 'production',
      adminInitialPassword: values.ADMIN_INITIAL_PASSWORD,
    },
  } as const;
}

/**
 * TLS options for PostgreSQL. With a CA certificate (cloud databases such as Aiven provide one)
 * the server's certificate and host name are checked; without one the connection is encrypted
 * but the server is not verified.
 */
function sslOptions(caFile: string): { ca?: string; rejectUnauthorized: boolean } {
  if (!caFile) {
    return { rejectUnauthorized: false };
  }
  const file = resolve(process.cwd(), caFile);
  try {
    return { ca: readFileSync(file, 'utf8'), rejectUnauthorized: true };
  } catch {
    throw new Error(
      `Invalid environment configuration:\n  DB_SSL_CA: cannot read the certificate file ${file}`,
    );
  }
}

export const env = loadEnv();
export type AppEnv = typeof env;

/** Extra hint for connection errors when DB_PASSWORD was never filled in. */
export function dbCredentialsHint(): string {
  return env.db.password === 'CHANGE_ME' || env.db.password === ''
    ? ' DB_PASSWORD in .env is still empty or the CHANGE_ME placeholder — set it to your PostgreSQL password.'
    : '';
}

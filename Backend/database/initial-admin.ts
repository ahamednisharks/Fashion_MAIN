import type { Queryable } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/modules/auth/password.js';

/**
 * Default sign-in for a new installation, created by `npm run db:migrate` (and re-created by the
 * seed in a fresh test database) when the users table is empty:
 *
 *   username: admin
 *   password: admin@123   (override with ADMIN_INITIAL_PASSWORD in .env)
 *
 * The password is publicly known, so the account must choose its own password at first sign-in.
 * Once any user exists this does nothing — it never resets or duplicates an account.
 */
export const INITIAL_ADMIN = { username: 'admin', fullName: 'Shop Admin' } as const;
export const DEFAULT_ADMIN_PASSWORD = 'admin@123';

export function initialAdminPassword(): string {
  return env.auth.adminInitialPassword ?? DEFAULT_ADMIN_PASSWORD;
}

/** Creates the default administrator when there are no users yet. Returns true if it did. */
export async function ensureInitialAdmin(db: Queryable): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO users (username, full_name, role, password_hash, must_change_password)
     SELECT $1, $2, 'admin', $3, true
      WHERE NOT EXISTS (SELECT 1 FROM users)`,
    [INITIAL_ADMIN.username, INITIAL_ADMIN.fullName, await hashPassword(initialAdminPassword())],
  );
  return (result.rowCount ?? 0) > 0;
}

export function initialAdminMessage(): string {
  return (
    `Created default login — username "${INITIAL_ADMIN.username}", password "${initialAdminPassword()}". ` +
    'You will be asked to choose a new password at first sign-in.'
  );
}

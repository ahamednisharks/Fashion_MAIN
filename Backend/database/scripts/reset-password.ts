/**
 * Recovery tool: issues a new temporary password for a user, unlocks and reactivates the
 * account, and signs it out everywhere.
 *
 *   npm run user:reset-password -- <username>
 */
import { logger } from '../../src/common/utils/logger.js';
import { closeDatabase, withTransaction } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { generateTemporaryPassword, hashPassword } from '../../src/modules/auth/password.js';

async function resetPassword(username: string): Promise<string> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await withTransaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      `UPDATE users
          SET password_hash = $2, must_change_password = true, password_changed_at = now(),
              failed_login_attempts = 0, locked_until = NULL, status = 'active'
        WHERE lower(username) = lower($1)
        RETURNING id`,
      [username, passwordHash],
    );
    const userId = result.rows[0]?.id;
    if (!userId) {
      throw new Error(`No user named "${username}" in database "${env.db.database}".`);
    }
    await tx.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  });
  return temporaryPassword;
}

const username = process.argv[2];
if (!username) {
  logger.error('Usage: npm run user:reset-password -- <username>');
  process.exitCode = 1;
} else {
  resetPassword(username)
    .then((password) =>
      logger.info(
        `Password for "${username}" reset. Temporary password: ${password}\n` +
          'The user must choose a new password at next sign-in.',
      ),
    )
    .catch((error: unknown) => {
      logger.error(error instanceof Error ? error.message : 'Password reset failed', error);
      process.exitCode = 1;
    })
    .finally(() => closeDatabase());
}

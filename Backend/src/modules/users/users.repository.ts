import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, TableRepository } from '../../common/crud/master.repository.js';
import type { EntityStatus } from '../../common/validators/fields.js';
import type { User, UserRole } from './users.schema.js';

const TABLE: MasterTable = {
  table: 'users',
  alias: 'u',
  columns: `u.id, u.username, u.full_name AS "fullName", u.role, u.status,
            u.must_change_password AS "mustChangePassword", u.last_login_at AS "lastLoginAt",
            u.created_at AS "createdAt", u.updated_at AS "updatedAt"`,
  searchSql: (p) => `concat_ws(' ', u.username, u.full_name) ILIKE ${p}`,
  sortable: {
    username: 'u.username',
    fullName: 'lower(u.full_name)',
    role: 'u.role',
    status: 'u.status',
    lastLoginAt: 'u.last_login_at',
    createdAt: 'u.created_at',
  },
  defaultOrder: 'lower(u.full_name)',
  filters: { role: 'u.role' },
  uniqueFields: { username: 'u.username' },
};

/** Columns needed to verify a sign-in (never returned by the API). */
export interface UserCredentials {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  status: EntityStatus;
  mustChangePassword: boolean;
  passwordHash: string;
  lockedUntil: Date | null;
}

const CREDENTIAL_COLUMNS = `id, username, full_name AS "fullName", role, status,
  must_change_password AS "mustChangePassword", password_hash AS "passwordHash",
  locked_until AS "lockedUntil"`;

export class UsersRepository extends TableRepository<User> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async findCredentialsByUsername(username: string): Promise<UserCredentials | null> {
    const result = await this.db.query<UserCredentials>(
      `SELECT ${CREDENTIAL_COLUMNS} FROM users WHERE lower(username) = lower($1)`,
      [username],
    );
    return result.rows[0] ?? null;
  }

  async findCredentialsById(id: string): Promise<UserCredentials | null> {
    const result = await this.db.query<UserCredentials>(
      `SELECT ${CREDENTIAL_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** New accounts always start with a temporary password that must be changed. */
  async create(user: {
    username: string;
    fullName: string;
    role: UserRole;
    passwordHash: string;
  }): Promise<User> {
    const result = await this.db.query<User>(
      `INSERT INTO users AS u (username, full_name, role, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, true)
       RETURNING ${TABLE.columns}`,
      [user.username, user.fullName, user.role, user.passwordHash],
    );
    return result.rows[0];
  }

  async update(id: string, changes: { fullName: string; role: UserRole }): Promise<User | null> {
    const result = await this.db.query<User>(
      `UPDATE users AS u SET full_name = $1, role = $2 WHERE u.id = $3 RETURNING ${TABLE.columns}`,
      [changes.fullName, changes.role, id],
    );
    return result.rows[0] ?? null;
  }

  /** Replaces the password and clears any lockout. */
  async setPassword(id: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
    await this.db.query(
      `UPDATE users
          SET password_hash = $2, must_change_password = $3, password_changed_at = now(),
              failed_login_attempts = 0, locked_until = NULL
        WHERE id = $1`,
      [id, passwordHash, mustChangePassword],
    );
  }

  /**
   * Counts a failed sign-in. Reaching `maxAttempts` locks the account for `lockMinutes`
   * and resets the counter. Returns the lock expiry when the account is now locked.
   */
  async recordFailedLogin(id: string, maxAttempts: number, lockMinutes: number): Promise<Date | null> {
    const result = await this.db.query<{ lockedUntil: Date | null }>(
      `UPDATE users
          SET locked_until = CASE WHEN failed_login_attempts + 1 >= $2
                                  THEN now() + make_interval(mins => $3) ELSE locked_until END,
              failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= $2
                                           THEN 0 ELSE failed_login_attempts + 1 END
        WHERE id = $1
        RETURNING locked_until AS "lockedUntil"`,
      [id, maxAttempts, lockMinutes],
    );
    const lockedUntil = result.rows[0]?.lockedUntil ?? null;
    return lockedUntil && lockedUntil > new Date() ? lockedUntil : null;
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
        WHERE id = $1`,
      [id],
    );
  }

  /** Active admins, optionally ignoring one user (to check "would this leave no admin?"). */
  async countActiveAdmins(excludeUserId?: string): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users
        WHERE role = 'admin' AND status = 'active' AND ($1::uuid IS NULL OR id <> $1::uuid)`,
      [excludeUserId ?? null],
    );
    return result.rows[0]?.count ?? 0;
  }
}

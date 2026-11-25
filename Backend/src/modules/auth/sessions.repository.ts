import { createHash, randomBytes } from 'node:crypto';

import { type Queryable, pool } from '../../config/database.js';
import type { AuthUser } from './auth.schema.js';

/** Opaque session token for the cookie (256 bits of randomness). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored, so a database leak does not expose usable tokens. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionWithUser {
  sessionId: string;
  persistent: boolean;
  lastSeenAt: Date;
  expiresAt: Date;
  user: AuthUser;
}

interface SessionRow {
  sessionId: string;
  persistent: boolean;
  lastSeenAt: Date;
  expiresAt: Date;
  id: string;
  username: string;
  fullName: string;
  role: AuthUser['role'];
  mustChangePassword: boolean;
}

export class SessionsRepository {
  constructor(private readonly db: Queryable = pool) {}

  async create(session: {
    userId: string;
    tokenHash: string;
    persistent: boolean;
    expiresAt: Date;
    userAgent: string;
    ipAddress: string;
  }): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO user_sessions (user_id, token_hash, persistent, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        session.userId,
        session.tokenHash,
        session.persistent,
        session.expiresAt,
        session.userAgent.slice(0, 300),
        session.ipAddress.slice(0, 64),
      ],
    );
    return result.rows[0].id;
  }

  /** A non-expired session of an active user, or null. */
  async findValid(tokenHash: string): Promise<SessionWithUser | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT s.id AS "sessionId", s.persistent, s.last_seen_at AS "lastSeenAt",
              s.expires_at AS "expiresAt",
              u.id, u.username, u.full_name AS "fullName", u.role,
              u.must_change_password AS "mustChangePassword"
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const { sessionId, persistent, lastSeenAt, expiresAt, ...user } = row;
    return { sessionId, persistent, lastSeenAt, expiresAt, user };
  }

  /** Sliding expiration: records activity and pushes the expiry forward. */
  async touch(sessionId: string, expiresAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE user_sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1',
      [sessionId, expiresAt],
    );
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
  }

  /** Signs a user out everywhere (optionally keeping the current session). */
  async deleteForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.db.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)',
      [userId, exceptSessionId ?? null],
    );
  }

  async deleteExpired(): Promise<void> {
    await this.db.query('DELETE FROM user_sessions WHERE expires_at <= now()');
  }
}

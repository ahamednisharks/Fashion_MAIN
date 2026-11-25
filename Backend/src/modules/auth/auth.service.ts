import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { type UserCredentials, UsersRepository } from '../users/users.repository.js';
import type { AuthUser, ChangePasswordInput, LoginInput } from './auth.schema.js';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from './login-throttle.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import {
  SessionsRepository,
  generateSessionToken,
  hashSessionToken,
} from './sessions.repository.js';

/** Failed passwords before the account is locked, and for how long. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
/** Sliding expiry is written at most this often per session. */
const TOUCH_INTERVAL_MS = 60_000;

const INVALID_CREDENTIALS = 'Invalid username or password.';

/** The authenticated request context (stored on res.locals.auth). */
export interface AuthContext {
  readonly sessionId: string;
  readonly user: AuthUser;
  readonly persistent: boolean;
  readonly expiresAt: Date;
  /** True when this request extended the session (the cookie should be re-sent). */
  readonly refreshed: boolean;
}

export interface LoginResult {
  readonly token: string;
  readonly user: AuthUser;
  readonly persistent: boolean;
  readonly expiresAt: Date;
}

function toAuthUser(user: UserCredentials): AuthUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

function lockedMessage(until: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return `Too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export class AuthService {
  constructor(
    private readonly users = new UsersRepository(),
    private readonly sessions = new SessionsRepository(),
  ) {}

  sessionLifetimeMs(persistent: boolean): number {
    return persistent ? env.auth.sessionRememberMs : env.auth.sessionIdleMs;
  }

  async login(input: LoginInput, client: { ip: string; userAgent: string }): Promise<LoginResult> {
    assertLoginAllowed(client.ip);
    const user = await this.users.findCredentialsByUsername(input.username);

    if (!user) {
      // Same work as a real check, so timing does not reveal whether the username exists.
      await verifyPassword(input.password, await DUMMY_PASSWORD_HASH);
      recordLoginFailure(client.ip);
      throw AppError.unauthenticated(INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, 'TOO_MANY_REQUESTS', lockedMessage(user.lockedUntil));
    }
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      recordLoginFailure(client.ip);
      const lockedUntil = await this.users.recordFailedLogin(user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES);
      if (lockedUntil) {
        throw new AppError(429, 'TOO_MANY_REQUESTS', lockedMessage(lockedUntil));
      }
      throw AppError.unauthenticated(INVALID_CREDENTIALS);
    }
    // Only reveal the account state after the correct password was given.
    if (user.status !== 'active') {
      throw AppError.forbidden('This account has been deactivated. Please contact your administrator.');
    }

    clearLoginFailures(client.ip);
    await this.users.recordSuccessfulLogin(user.id);
    await this.sessions.deleteExpired();

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionLifetimeMs(input.remember));
    await this.sessions.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      persistent: input.remember,
      expiresAt,
      userAgent: client.userAgent,
      ipAddress: client.ip,
    });
    return { token, user: toAuthUser(user), persistent: input.remember, expiresAt };
  }

  /** Resolves a session token to the signed-in user, extending the session (sliding expiry). */
  async authenticate(token: string): Promise<AuthContext | null> {
    const session = await this.sessions.findValid(hashSessionToken(token));
    if (!session) {
      return null;
    }
    const now = Date.now();
    if (now - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) {
      return { ...session, refreshed: false };
    }
    const expiresAt = new Date(now + this.sessionLifetimeMs(session.persistent));
    await this.sessions.touch(session.sessionId, expiresAt);
    return { ...session, expiresAt, refreshed: true };
  }

  /** Ends the session for this token (no-op when it is already gone). */
  async logout(token: string): Promise<void> {
    const session = await this.sessions.findValid(hashSessionToken(token));
    if (session) {
      await this.sessions.delete(session.sessionId);
    }
  }

  /** Changes the caller's password and signs out their other sessions. */
  async changePassword(auth: AuthContext, input: ChangePasswordInput): Promise<AuthUser> {
    const user = await this.users.findCredentialsById(auth.user.id);
    if (!user) {
      throw AppError.unauthenticated();
    }
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw AppError.validation('Current password is incorrect.', 'currentPassword');
    }
    if (input.newPassword === input.currentPassword) {
      throw AppError.validation('Choose a password different from your current one.', 'newPassword');
    }
    if (input.newPassword.toLowerCase().includes(user.username.toLowerCase())) {
      throw AppError.validation('Password must not contain your username.', 'newPassword');
    }
    await this.users.setPassword(user.id, await hashPassword(input.newPassword), false);
    await this.sessions.deleteForUser(user.id, auth.sessionId);
    return { ...toAuthUser(user), mustChangePassword: false };
  }
}

export const authService = new AuthService();

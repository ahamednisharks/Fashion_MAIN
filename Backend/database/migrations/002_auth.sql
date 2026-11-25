-- =============================================================================
-- 002 — Authentication: users and sign-in sessions.
--
--   * Passwords are stored as scrypt hashes (see src/modules/auth/password.ts).
--   * Sessions are opaque random tokens kept in an httpOnly cookie; only the
--     SHA-256 hash of the token is stored, so a database leak does not expose
--     usable session tokens.
-- =============================================================================

CREATE TABLE users (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  username              varchar(40)   NOT NULL
                        CONSTRAINT users_username_check CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  full_name             varchar(100)  NOT NULL CONSTRAINT users_full_name_check CHECK (btrim(full_name) <> ''),
  password_hash         text          NOT NULL,
  role                  varchar(10)   NOT NULL DEFAULT 'staff'
                        CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff')),
  status                varchar(10)   NOT NULL DEFAULT 'active'
                        CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive')),
  -- Set for new accounts and after an admin reset: the user must choose a new password.
  must_change_password  boolean       NOT NULL DEFAULT false,
  failed_login_attempts integer       NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  password_changed_at   timestamptz   NOT NULL DEFAULT now(),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_sessions (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL
               CONSTRAINT user_sessions_user_id_fkey REFERENCES users (id) ON DELETE CASCADE,
  token_hash   char(64)     NOT NULL,
  -- "Keep me signed in": longer lifetime and a persistent cookie.
  persistent   boolean      NOT NULL DEFAULT false,
  user_agent   varchar(300) NOT NULL DEFAULT '',
  ip_address   varchar(64)  NOT NULL DEFAULT '',
  created_at   timestamptz  NOT NULL DEFAULT now(),
  last_seen_at timestamptz  NOT NULL DEFAULT now(),
  expires_at   timestamptz  NOT NULL
);
CREATE UNIQUE INDEX user_sessions_token_hash_key ON user_sessions (token_hash);
CREATE INDEX user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expires_at_idx ON user_sessions (expires_at);

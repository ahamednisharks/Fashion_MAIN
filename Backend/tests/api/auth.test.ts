import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { pool } from '../../src/config/database.js';
import { ADMIN_CREDENTIALS, type TestApi, type TestClient, startApi } from '../helpers/harness.js';

interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
}
interface UserWithPassword {
  user: AuthUser & { status: string };
  temporaryPassword: string;
}

let api: TestApi; // signed in as admin

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
});

async function anonymous(): Promise<TestClient> {
  const client = await api.newClient();
  await client.get('/health'); // receives the XSRF cookie, like the SPA on first load
  return client;
}

async function createStaff(username: string, role = 'staff'): Promise<UserWithPassword> {
  const res = await api.post<UserWithPassword>('/users', {
    username,
    fullName: `${username} name`,
    role,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

/** Signs in a new user and replaces their temporary password. */
async function signedInStaff(
  username: string,
  password = 'Shop2026pass',
): Promise<{ client: TestClient; id: string }> {
  const { user, temporaryPassword } = await createStaff(username);
  const client = await anonymous();
  assert.equal((await client.login(username, temporaryPassword)).status, 200);
  const changed = await client.post('/auth/change-password', {
    currentPassword: temporaryPassword,
    newPassword: password,
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  return { client, id: user.id };
}

describe('access control', () => {
  it('requires a session for master data but keeps health public', async () => {
    const client = await anonymous();
    const res = await client.get('/categories');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.equal((await client.get('/health')).status, 200);
    assert.equal((await client.get('/auth/me')).status, 401);
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await api.post('/categories', { name: 'Forged' }, { xsrf: false });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CSRF_FAILED');
    const login = await (await anonymous()).post('/auth/login', ADMIN_CREDENTIALS, { xsrf: false });
    assert.equal(login.body.error.code, 'CSRF_FAILED');
  });
});

describe('sign in', () => {
  it('rejects wrong passwords and unknown users with the same message', async () => {
    const client = await anonymous();
    const wrong = await client.login('admin', 'not-the-password');
    const unknown = await client.login('nobody', 'whatever1');
    assert.deepEqual([wrong.status, unknown.status], [401, 401]);
    assert.equal(wrong.body.error.message, 'Invalid username or password.');
    assert.equal(unknown.body.error.message, wrong.body.error.message);
  });

  it('sets an httpOnly, SameSite=Lax session cookie and stores only its hash', async () => {
    const client = await anonymous();
    const res = await client.login('ADMIN', ADMIN_CREDENTIALS.password); // case-insensitive username
    assert.equal(res.status, 200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('fashion_session='));
    assert.match(cookie ?? '', /HttpOnly/i);
    assert.match(cookie ?? '', /SameSite=Lax/i);
    assert.doesNotMatch(cookie ?? '', /Expires=/i, 'non-remembered sessions end with the browser');

    const token = client.cookies.get('fashion_session') ?? '';
    const stored = await pool.query('SELECT 1 FROM user_sessions WHERE token_hash = $1', [
      createHash('sha256').update(token).digest('hex'),
    ]);
    assert.equal(stored.rowCount, 1);
    const plain = await pool.query('SELECT 1 FROM user_sessions WHERE token_hash = $1', [token]);
    assert.equal(plain.rowCount, 0);

    const me = await client.get<AuthUser>('/auth/me');
    assert.equal(me.body.data.username, 'admin');
    assert.equal(me.body.data.role, 'admin');
  });

  it('"keep me signed in" sets a persistent cookie', async () => {
    const res = await (await anonymous()).login('admin', ADMIN_CREDENTIALS.password, true);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('fashion_session='));
    assert.match(cookie ?? '', /Expires=/i);
  });

  it('signs out and ends the session on the server', async () => {
    const client = await anonymous();
    await client.login('admin', ADMIN_CREDENTIALS.password);
    const token = client.cookies.get('fashion_session') ?? '';
    assert.equal((await client.post('/auth/logout')).status, 204);
    assert.equal(client.cookies.has('fashion_session'), false);
    // Re-using the old token (e.g. a copied cookie) no longer works.
    client.cookies.set('fashion_session', token);
    assert.equal((await client.get('/auth/me')).status, 401);
  });

  it('expires sessions', async () => {
    const client = await anonymous();
    await client.login('admin', ADMIN_CREDENTIALS.password);
    const hash = createHash('sha256')
      .update(client.cookies.get('fashion_session') ?? '')
      .digest('hex');
    await pool.query(
      "UPDATE user_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
      [hash],
    );
    const res = await client.get('/categories');
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /session has ended/);
  });

  it('locks an account after 5 wrong passwords', async () => {
    const { client } = await signedInStaff('locky');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      statuses.push((await client.login('locky', 'wrong-password-1')).status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
    const correct = await client.login('locky', 'Shop2026pass');
    assert.equal(correct.status, 429, 'even the right password waits for the lock');
    assert.match(correct.body.error.message, /try again in \d+ minute/);

    await pool.query(
      "UPDATE users SET locked_until = now() - interval '1 second' WHERE username = 'locky'",
    );
    assert.equal((await client.login('locky', 'Shop2026pass')).status, 200);
  });
});

describe('temporary passwords', () => {
  it('forces new users to change their password before using the app', async () => {
    const { temporaryPassword, user } = await createStaff('ravi');
    assert.equal(user.mustChangePassword, true);
    assert.match(temporaryPassword, /^[A-Za-z0-9]{10}$/);

    const client = await anonymous();
    const login = await client.login('ravi', temporaryPassword);
    assert.equal((login.body.data as AuthUser).mustChangePassword, true);
    const blocked = await client.get('/categories');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await client.get('/auth/me')).status, 200);

    const wrongCurrent = await client.post('/auth/change-password', {
      currentPassword: 'nope',
      newPassword: 'Better2026',
    });
    assert.equal(wrongCurrent.body.error.field, 'currentPassword');
    const weak = await client.post('/auth/change-password', {
      currentPassword: temporaryPassword,
      newPassword: 'short',
    });
    assert.equal(weak.body.error.field, 'newPassword');
    const containsName = await client.post('/auth/change-password', {
      currentPassword: temporaryPassword,
      newPassword: 'ravi12345',
    });
    assert.match(containsName.body.error.message, /username/);

    const ok = await client.post<AuthUser>('/auth/change-password', {
      currentPassword: temporaryPassword,
      newPassword: 'Better2026',
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.mustChangePassword, false);
    assert.equal((await client.get('/categories')).status, 200);
  });

  it('signs out other sessions when the password changes', async () => {
    const { client } = await signedInStaff('meena');
    const laptop = await anonymous();
    await laptop.login('meena', 'Shop2026pass');
    assert.equal((await laptop.get('/auth/me')).status, 200);
    await client.post('/auth/change-password', {
      currentPassword: 'Shop2026pass',
      newPassword: 'Newer2026pass',
    });
    assert.equal((await laptop.get('/auth/me')).status, 401);
    assert.equal(
      (await client.get('/auth/me')).status,
      200,
      'the session that changed it stays signed in',
    );
  });
});

describe('user management', () => {
  it('is admin-only', async () => {
    const { client } = await signedInStaff('karthik');
    const res = await client.get('/users');
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal((await client.get('/categories')).status, 200, 'staff can use master data');
  });

  it('validates and normalises usernames', async () => {
    const created = await api.post<UserWithPassword>('/users', {
      username: '  Priya.R ',
      fullName: 'Priya R',
    });
    assert.equal(created.body.data.user.username, 'priya.r');
    assert.equal(created.body.data.user.role, 'staff');
    const duplicate = await api.post('/users', { username: 'PRIYA.R', fullName: 'Other' });
    assert.equal(duplicate.status, 409);
    const invalid = await api.post('/users', { username: 'a b', fullName: 'X' });
    assert.equal(invalid.body.error.field, 'username');
    const exists = await api.get<{ exists: boolean }>('/users/exists?field=username&value=priya.r');
    assert.equal(exists.body.data.exists, true);
  });

  it('deactivating a user signs them out; reset issues a new temporary password', async () => {
    const { client, id } = await signedInStaff('anand');
    const deactivated = await api.patch(`/users/${id}/status`, { status: 'inactive' });
    assert.equal(deactivated.status, 200);
    assert.equal((await client.get('/auth/me')).status, 401);
    const blocked = await client.login('anand', 'Shop2026pass');
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error.message, /deactivated/);

    await api.patch(`/users/${id}/status`, { status: 'active' });
    const reset = await api.post<UserWithPassword>(`/users/${id}/reset-password`);
    assert.equal(reset.body.data.user.mustChangePassword, true);
    assert.equal(
      (await client.login('anand', 'Shop2026pass')).status,
      401,
      'old password no longer works',
    );
    assert.equal((await client.login('anand', reset.body.data.temporaryPassword)).status, 200);
  });

  it('protects the acting admin and the last active admin', async () => {
    const me = (await api.get<AuthUser>('/auth/me')).body.data;
    assert.equal((await api.patch(`/users/${me.id}/status`, { status: 'inactive' })).status, 403);
    assert.equal((await api.delete(`/users/${me.id}`)).status, 403);
    assert.equal((await api.post(`/users/${me.id}/reset-password`)).status, 403);
    const demoteSelf = await api.put(`/users/${me.id}`, { fullName: 'Shop Admin', role: 'staff' });
    assert.equal(demoteSelf.status, 403);

    const second = await createStaff('owner2', 'admin');
    const demote = await api.put(`/users/${second.user.id}`, {
      fullName: 'Owner Two',
      role: 'staff',
    });
    assert.equal(demote.status, 200, 'another admin remains');
    assert.equal((await api.delete(`/users/${second.user.id}`)).status, 204);
  });

  it('lists users with search and role filter, never exposing password hashes', async () => {
    const res = await api.get<{ items: Record<string, unknown>[]; total: number }>(
      '/users?role=admin',
    );
    assert.ok(res.body.data.items.every((user) => user['role'] === 'admin'));
    assert.ok(
      res.body.data.items.every((user) => !('passwordHash' in user) && !('password_hash' in user)),
    );
    const search = await api.get<{ items: { username: string }[] }>('/users?search=priya');
    assert.deepEqual(
      search.body.data.items.map((user) => user.username),
      ['priya.r'],
    );
  });
});

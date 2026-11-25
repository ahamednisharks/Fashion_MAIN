import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ensureDatabase } from '../../database/create-database.js';
import { runMigrations } from '../../database/migrations/migrate.js';
import { INITIAL_ADMIN, initialAdminPassword, runSeeds } from '../../database/seeds/seed.js';
import { createApp } from '../../src/app.js';
import { closeDatabase, pool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: {
    success: boolean;
    data: T;
    error: {
      code: string;
      message: string;
      field?: string;
      details?: { field: string; message: string }[];
    };
  };
}

export interface RequestOptions {
  /** Send the X-XSRF-TOKEN header on state-changing requests (default true, like Angular). */
  xsrf?: boolean;
}

/** A browser-like client: keeps cookies and sends the CSRF header like Angular does. */
export interface TestClient {
  readonly cookies: Map<string, string>;
  get<T = unknown>(path: string): Promise<ApiResponse<T>>;
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>>;
  put<T = unknown>(path: string, body: unknown): Promise<ApiResponse<T>>;
  patch<T = unknown>(path: string, body: unknown): Promise<ApiResponse<T>>;
  delete<T = unknown>(path: string): Promise<ApiResponse<T>>;
  /** Sends a raw (possibly malformed) body. */
  raw<T = unknown>(method: string, path: string, body: string): Promise<ApiResponse<T>>;
  login(username: string, password: string, remember?: boolean): Promise<ApiResponse<unknown>>;
}

export interface TestApi extends TestClient {
  /** e.g. http://127.0.0.1:54321/api/v1 */
  readonly baseUrl: string;
  /** A new client with its own cookie jar (another browser / user). */
  newClient(): Promise<TestClient>;
  close(): Promise<void>;
}

/** Recreates the test database contents: schema + demo seed data + ready-to-use admin. */
export async function resetDatabase(): Promise<void> {
  const looksLikeTestDb = env.db.database.endsWith('_test') || !!process.env['TEST_DB_NAME'];
  if (!env.isTest || !looksLikeTestDb) {
    throw new Error(`Refusing to reset non-test database "${env.db.database}".`);
  }
  await pool.query(
    `TRUNCATE categories, brands, sizes, colors, suppliers, customers, products, product_variants,
              users, user_sessions, sales_invoices, sales_invoice_items, sales_invoice_payments,
              invoice_counters, shop_settings, purchase_orders, purchase_order_items,
              purchase_entries, purchase_entry_items, stock_adjustments, stock_adjustment_items,
              stock_movements, stock_levels,
              document_counters, barcode_settings RESTART IDENTITY CASCADE`,
  );
  await pool.query('INSERT INTO shop_settings (id) VALUES (1)');
  await pool.query('INSERT INTO barcode_settings (id) VALUES (1)');
  await runSeeds();
  // Tests start from an admin that has already replaced the temporary password.
  await pool.query('UPDATE users SET must_change_password = false WHERE username = $1', [
    INITIAL_ADMIN.username,
  ]);
}

export const ADMIN_CREDENTIALS = {
  username: INITIAL_ADMIN.username,
  password: initialAdminPassword(),
};

function createClient(base: string): TestClient {
  const cookies = new Map<string, string>();

  const storeCookies = (headers: Headers) => {
    for (const cookie of headers.getSetCookie()) {
      const [pair = '', ...attributes] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = decodeURIComponent(pair.slice(index + 1).trim());
      const expired = attributes.some((attribute) =>
        /expires=thu, 01 jan 1970/i.test(attribute.trim()),
      );
      if (!value || expired) {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    }
  };

  const request = async <T>(
    method: string,
    path: string,
    body: string | undefined,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookies.size) {
      headers['Cookie'] = [...cookies]
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ');
    }
    const xsrf = cookies.get('XSRF-TOKEN');
    if (method !== 'GET' && options.xsrf !== false && xsrf) headers['X-XSRF-TOKEN'] = xsrf;

    const response = await fetch(base + path, { method, headers, body });
    storeCookies(response.headers);
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text ? JSON.parse(text) : undefined,
    } as ApiResponse<T>;
  };
  const json = (value: unknown) => (value === undefined ? undefined : JSON.stringify(value));

  return {
    cookies,
    get: (path) => request('GET', path, undefined),
    post: (path, body, options) => request('POST', path, json(body ?? {}), options),
    put: (path, body) => request('PUT', path, json(body)),
    patch: (path, body) => request('PATCH', path, json(body)),
    delete: (path) => request('DELETE', path, undefined),
    raw: (method, path, body) => request(method, path, body),
    async login(username, password, remember = false) {
      if (!cookies.has('XSRF-TOKEN')) {
        await request('GET', '/health', undefined); // obtain the CSRF cookie, like the SPA does
      }
      return request('POST', '/auth/login', JSON.stringify({ username, password, remember }));
    },
  };
}

/** Prepares the test database, starts the API on a random port and signs in as the admin. */
export async function startApi(options: { signIn?: boolean } = {}): Promise<TestApi> {
  await ensureDatabase(env.db.database);
  await runMigrations();
  await resetDatabase();

  const server: Server = await new Promise((resolve) => {
    const listening = createApp().listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/v1`;

  const client = createClient(base);
  if (options.signIn !== false) {
    const login = await client.login(ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    if (login.status !== 200) {
      throw new Error(`Test admin sign-in failed: ${JSON.stringify(login.body)}`);
    }
  }

  return {
    ...client,
    baseUrl: base,
    newClient: async () => createClient(base),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closeDatabase();
    },
  };
}

/** Finds a record id by name via the lookup endpoint. */
export async function idByName(api: TestClient, resource: string, name: string): Promise<string> {
  const { body } = await api.get<{ id: string; name: string }[]>(`/${resource}/lookup`);
  const match = body.data.find((row) => row.name === name);
  if (!match) {
    throw new Error(`${resource} "${name}" not found in seed data`);
  }
  return match.id;
}

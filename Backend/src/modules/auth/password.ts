import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

/*
 * Password hashing with scrypt (Node's built-in memory-hard KDF — no native dependencies).
 * Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
 * Parameters are stored with each hash, so they can be raised later without breaking old hashes.
 */

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** Enough for 128 * N * r bytes of scrypt working memory. */
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A valid hash of a random password, verified against when a username does not exist so the
 * response time does not reveal which usernames are registered.
 */
export const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));

const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Readable one-time password (no 0/O, 1/l/I), always containing letters and digits. */
export function generateTemporaryPassword(length = 10): string {
  for (;;) {
    const value = Array.from({ length }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) {
      return value;
    }
  }
}

/** Password rules for passwords chosen by users. */
export const newPasswordField = z
  .string({ error: 'New password is required.' })
  .min(8, { error: 'Password must be at least 8 characters.' })
  .max(128, { error: 'Password can be at most 128 characters.' })
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    error: 'Password must contain at least one letter and one number.',
  });

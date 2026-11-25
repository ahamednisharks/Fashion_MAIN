import { z } from 'zod';

import { roleEnum } from '../users/users.schema.js';
import { newPasswordField } from './password.js';

/** The signed-in user, as returned by /auth/login and /auth/me. */
export const authUserSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    fullName: z.string(),
    role: roleEnum,
    mustChangePassword: z
      .boolean()
      .describe('When true, every other endpoint answers 403 PASSWORD_CHANGE_REQUIRED.'),
  })
  .meta({ id: 'AuthUser' });
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginSchema = z
  .object({
    username: z
      .string({ error: 'Username is required.' })
      .trim()
      .toLowerCase()
      .min(1, { error: 'Username is required.' })
      .max(40),
    password: z
      .string({ error: 'Password is required.' })
      .min(1, { error: 'Password is required.' })
      .max(128),
    remember: z.boolean().default(false).describe('Keep me signed in (longer session).'),
  })
  .meta({ id: 'LoginRequest' });
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Current password is required.' })
      .min(1, { error: 'Current password is required.' })
      .max(128),
    newPassword: newPasswordField,
  })
  .meta({ id: 'ChangePasswordRequest' });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

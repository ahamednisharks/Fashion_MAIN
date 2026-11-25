import { z } from 'zod';

import { requiredText, statusEnum } from '../../common/validators/fields.js';
import {
  createExistsQuerySchema,
  createListQuerySchema,
} from '../../common/validators/list-query.js';

export const USER_ROLES = ['admin', 'staff'] as const;
export const roleEnum = z.enum(USER_ROLES, { error: "Role must be 'admin' or 'staff'." });
export type UserRole = z.infer<typeof roleEnum>;

export const userSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    fullName: z.string(),
    role: roleEnum,
    status: statusEnum,
    mustChangePassword: z.boolean().describe('True until the user replaces a temporary password.'),
    lastLoginAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'User' });
export type User = z.infer<typeof userSchema>;

export const usernameField = z
  .string({ error: 'Username is required.' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, {
    error:
      'Username must be 3–40 characters: letters, numbers, dot, hyphen or underscore, starting with a letter or number.',
  });

export const userCreateSchema = z
  .object({
    username: usernameField.describe('Login name (stored in lowercase, cannot be changed later).'),
    fullName: requiredText('Full name', 100),
    role: roleEnum.default('staff'),
  })
  .meta({ id: 'UserCreate' });
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z
  .object({
    fullName: requiredText('Full name', 100),
    role: roleEnum,
  })
  .meta({ id: 'UserUpdate' });
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

/** Returned when an account is created or its password is reset — shown to the admin once. */
export const userWithTemporaryPasswordSchema = z
  .object({ user: userSchema, temporaryPassword: z.string() })
  .meta({ id: 'UserWithTemporaryPassword' });

export const userListQuerySchema = createListQuerySchema(
  ['username', 'fullName', 'role', 'status', 'lastLoginAt', 'createdAt'],
  { role: roleEnum.optional().describe('Filter by role.') },
);
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userExistsQuerySchema = createExistsQuerySchema(['username']);

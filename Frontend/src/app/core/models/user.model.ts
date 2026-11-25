import { EntityStatus } from './base.model';

export type UserRole = 'admin' | 'staff';

export const ROLE_OPTIONS: readonly { value: UserRole; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Administrator' },
];

export function roleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

/** The signed-in user (GET /auth/me). */
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  /** True until a temporary password has been replaced. */
  mustChangePassword: boolean;
}

/** A staff account as managed on the Users screen. */
export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  status: EntityStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreateInput {
  username: string;
  fullName: string;
  role: UserRole;
}

export interface UserUpdateInput {
  fullName: string;
  role: UserRole;
}

/** Returned when an account is created or a password is reset (shown to the admin once). */
export interface UserWithTemporaryPassword {
  user: AppUser;
  temporaryPassword: string;
}

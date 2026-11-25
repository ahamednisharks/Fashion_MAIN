import { AppError } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import type { EntityStatus } from '../../common/validators/fields.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { SessionsRepository } from '../auth/sessions.repository.js';
import { UsersRepository } from './users.repository.js';
import type { User, UserCreateInput, UserListQuery, UserUpdateInput } from './users.schema.js';

export interface UserWithTemporaryPassword {
  user: User;
  temporaryPassword: string;
}

const LAST_ADMIN = 'At least one active administrator is required.';

/**
 * Staff account management (admin only). Admins cannot lock themselves out: they cannot
 * deactivate, delete or demote their own account, and the last active admin is protected.
 */
export class UsersService {
  constructor(
    private readonly users = new UsersRepository(),
    private readonly sessions = new SessionsRepository(),
  ) {}

  list(query: UserListQuery): Promise<Paged<User>> {
    return this.users.list(query);
  }

  async get(id: string): Promise<User> {
    return (await this.users.findById(id)) ?? notFound();
  }

  isTaken(value: string, excludeId?: string): Promise<boolean> {
    return this.users.isTaken('username', value, excludeId);
  }

  /** Creates the account with a one-time password the user must change at first sign-in. */
  async create(input: UserCreateInput): Promise<UserWithTemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword();
    const user = await this.users.create({
      username: input.username,
      fullName: input.fullName,
      role: input.role,
      passwordHash: await hashPassword(temporaryPassword),
    });
    return { user, temporaryPassword };
  }

  async update(actorId: string, id: string, input: UserUpdateInput): Promise<User> {
    const existing = await this.get(id);
    if (existing.role === 'admin' && input.role !== 'admin') {
      if (id === actorId) {
        throw AppError.forbidden('You cannot remove your own administrator role.');
      }
      await this.assertAnotherActiveAdmin(id);
    }
    return (await this.users.update(id, input)) ?? notFound();
  }

  async setStatus(actorId: string, id: string, status: EntityStatus): Promise<User> {
    const existing = await this.get(id);
    if (status === 'inactive') {
      if (id === actorId) {
        throw AppError.forbidden('You cannot deactivate your own account.');
      }
      if (existing.role === 'admin') {
        await this.assertAnotherActiveAdmin(id);
      }
    }
    const user = (await this.users.setStatus(id, status)) ?? notFound();
    if (status === 'inactive') {
      await this.sessions.deleteForUser(id);
    }
    return user;
  }

  /** Issues a new one-time password and signs the user out everywhere. */
  async resetPassword(actorId: string, id: string): Promise<UserWithTemporaryPassword> {
    if (id === actorId) {
      throw AppError.forbidden('Use "Change password" to change your own password.');
    }
    await this.get(id);
    const temporaryPassword = generateTemporaryPassword();
    await this.users.setPassword(id, await hashPassword(temporaryPassword), true);
    await this.sessions.deleteForUser(id);
    return { user: await this.get(id), temporaryPassword };
  }

  async remove(actorId: string, id: string): Promise<void> {
    if (id === actorId) {
      throw AppError.forbidden('You cannot delete your own account.');
    }
    const existing = await this.get(id);
    if (existing.role === 'admin' && existing.status === 'active') {
      await this.assertAnotherActiveAdmin(id);
    }
    if (!(await this.users.delete(id))) {
      notFound();
    }
  }

  private async assertAnotherActiveAdmin(excludeUserId: string): Promise<void> {
    if ((await this.users.countActiveAdmins(excludeUserId)) === 0) {
      throw AppError.validation(LAST_ADMIN, 'role');
    }
  }
}

function notFound(): never {
  throw AppError.notFound('User not found.');
}

export const usersService = new UsersService();

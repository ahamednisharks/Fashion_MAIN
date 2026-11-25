import type { Response } from 'express';

import type { IdParams, StatusBody } from '../../common/validators/list-query.js';
import { currentAuth } from '../auth/auth.middleware.js';
import type { UserCreateInput, UserListQuery, UserUpdateInput } from './users.schema.js';
import { usersService } from './users.service.js';

/** HTTP → service mapping for /users (the acting admin comes from the session). */
export class UsersController {
  constructor(private readonly service = usersService) {}

  readonly list = (query: UserListQuery) => this.service.list(query);

  readonly exists = async (query: { value: string; excludeId?: string }) => ({
    exists: await this.service.isTaken(query.value, query.excludeId),
  });

  readonly getById = (params: IdParams) => this.service.get(params.id);

  readonly create = (body: UserCreateInput) => this.service.create(body);

  readonly update = (params: IdParams, body: UserUpdateInput, res: Response) =>
    this.service.update(currentAuth(res).user.id, params.id, body);

  readonly setStatus = (params: IdParams, body: StatusBody, res: Response) =>
    this.service.setStatus(currentAuth(res).user.id, params.id, body.status);

  readonly resetPassword = (params: IdParams, res: Response) =>
    this.service.resetPassword(currentAuth(res).user.id, params.id);

  readonly remove = (params: IdParams, res: Response): Promise<void> =>
    this.service.remove(currentAuth(res).user.id, params.id);
}

export const usersController = new UsersController();

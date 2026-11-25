import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import {
  existsResultSchema,
  idParamsSchema,
  statusBodySchema,
} from '../../common/validators/list-query.js';
import { usersController as controller } from './users.controller.js';
import {
  userCreateSchema,
  userExistsQuerySchema,
  userListQuerySchema,
  userSchema,
  userUpdateSchema,
  userWithTemporaryPasswordSchema,
} from './users.schema.js';

export const usersModule: ApiModule = {
  basePath: '/users',
  tag: 'Users',
  access: 'admin',
  description:
    'Staff accounts (administrators only). New accounts and password resets return a one-time ' +
    'temporary password that the user must change at first sign-in.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'List users',
      schemas: { query: userListQuerySchema },
      success: { status: 200, description: 'A page of users.', schema: pagedSchema(userSchema) },
      errors: [400],
      handle: ({ query }) => controller.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/exists',
      summary: 'Check whether a username is taken',
      schemas: { query: userExistsQuerySchema },
      success: { status: 200, description: 'Whether it exists.', schema: existsResultSchema },
      errors: [400],
      handle: ({ query }) => controller.exists(query),
    }),
    defineRoute({
      method: 'get',
      path: '/:id',
      summary: 'Get a user',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The user.', schema: userSchema },
      errors: [400, 404],
      handle: ({ params }) => controller.getById(params),
    }),
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Create a user',
      description: 'Returns the user and a one-time temporary password.',
      schemas: { body: userCreateSchema },
      success: {
        status: 201,
        description: 'The created user and temporary password.',
        schema: userWithTemporaryPasswordSchema,
      },
      errors: [400, 409],
      handle: ({ body }) => controller.create(body),
    }),
    defineRoute({
      method: 'put',
      path: '/:id',
      summary: 'Update name and role',
      schemas: { params: idParamsSchema, body: userUpdateSchema },
      success: { status: 200, description: 'The updated user.', schema: userSchema },
      errors: [400, 404],
      handle: ({ params, body }, _req, res) => controller.update(params, body, res),
    }),
    defineRoute({
      method: 'patch',
      path: '/:id/status',
      summary: 'Activate or deactivate a user',
      description: 'Deactivating signs the user out everywhere.',
      schemas: { params: idParamsSchema, body: statusBodySchema },
      success: { status: 200, description: 'The updated user.', schema: userSchema },
      errors: [400, 404],
      handle: ({ params, body }, _req, res) => controller.setStatus(params, body, res),
    }),
    defineRoute({
      method: 'post',
      path: '/:id/reset-password',
      summary: 'Reset a password',
      description: 'Issues a new temporary password and signs the user out everywhere.',
      schemas: { params: idParamsSchema },
      success: {
        status: 200,
        description: 'The user and new temporary password.',
        schema: userWithTemporaryPasswordSchema,
      },
      errors: [400, 404],
      handle: ({ params }, _req, res) => controller.resetPassword(params, res),
    }),
    defineRoute({
      method: 'delete',
      path: '/:id',
      summary: 'Delete a user',
      schemas: { params: idParamsSchema },
      success: { status: 204, description: 'Deleted.' },
      errors: [400, 404],
      handle: ({ params }, _req, res) => controller.remove(params, res),
    }),
  ],
};

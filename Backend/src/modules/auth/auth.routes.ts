import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { authController as controller } from './auth.controller.js';
import { authUserSchema, changePasswordSchema, loginSchema } from './auth.schema.js';

export const authModule: ApiModule = {
  basePath: '/auth',
  tag: 'Authentication',
  description:
    'Cookie-based sessions. Sign in to receive an httpOnly `fashion_session` cookie. ' +
    'State-changing requests must send the `X-XSRF-TOKEN` header with the value of the ' +
    '`XSRF-TOKEN` cookie (Angular and this Swagger page do this automatically).',
  routes: [
    defineRoute({
      method: 'post',
      path: '/login',
      access: 'public',
      summary: 'Sign in',
      description:
        `Wrong passwords answer 401; after 5 failures the account is locked for 15 minutes (429). ` +
        'Deactivated accounts answer 403.',
      schemas: { body: loginSchema },
      success: { status: 200, description: 'Signed in; session cookie set.', schema: authUserSchema },
      errors: [400, 401, 403, 429],
      handle: ({ body }, req, res) => controller.login(body, req, res),
    }),
    defineRoute({
      method: 'post',
      path: '/logout',
      access: 'public',
      summary: 'Sign out',
      description: 'Ends the current session (succeeds even if it has already expired).',
      schemas: {},
      success: { status: 204, description: 'Signed out; session cookie cleared.' },
      handle: (_input, req, res) => controller.logout(req, res),
    }),
    defineRoute({
      method: 'get',
      path: '/me',
      allowPendingPasswordChange: true,
      summary: 'Current user',
      schemas: {},
      success: { status: 200, description: 'The signed-in user.', schema: authUserSchema },
      handle: (_input, _req, res) => controller.me(res),
    }),
    defineRoute({
      method: 'post',
      path: '/change-password',
      allowPendingPasswordChange: true,
      summary: 'Change your password',
      description:
        'Required after signing in with a temporary password. Other sessions of the user are signed out.',
      schemas: { body: changePasswordSchema },
      success: { status: 200, description: 'Password changed.', schema: authUserSchema },
      errors: [400],
      handle: ({ body }, _req, res) => controller.changePassword(body, res),
    }),
  ],
};

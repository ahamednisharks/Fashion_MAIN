import { type Request, type RequestHandler, type Response, Router } from 'express';
import type { z } from 'zod';

import {
  type RequestSchemas,
  type ValidatedInput,
  validateRequest,
} from '../middlewares/validate-request.js';
import { sendSuccess } from '../utils/response.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Who may call a route:
 *   'public' — anyone (health, sign-in);
 *   'user'   — any signed-in user (default);
 *   'admin'  — signed-in administrators only.
 */
export type RouteAccess = 'public' | 'user' | 'admin';

/** Builds the middleware enforcing a non-public access level (provided by the auth module). */
export type AccessGuard = (
  access: Exclude<RouteAccess, 'public'>,
  allowPendingPasswordChange: boolean,
) => RequestHandler;

type Parsed<T> = T extends z.ZodType ? z.output<T> : undefined;

/** Strongly typed, already-validated request input handed to route handlers. */
export interface RouteInput<S extends RequestSchemas> {
  params: Parsed<S['params']>;
  query: Parsed<S['query']>;
  body: Parsed<S['body']>;
}

/**
 * A single endpoint: routing, access control, validation, handler and OpenAPI metadata in one
 * place. The same definition registers the Express route and generates the Swagger docs.
 */
export interface RouteDefinition<S extends RequestSchemas = RequestSchemas> {
  readonly method: HttpMethod;
  /** Express path relative to the module base path, e.g. '/:id'. */
  readonly path: string;
  readonly summary: string;
  readonly description?: string;
  /** Defaults to the module's access level, which defaults to 'user'. */
  readonly access?: RouteAccess;
  /** Allow this route while the user still has to replace a temporary password. */
  readonly allowPendingPasswordChange?: boolean;
  readonly schemas: S;
  readonly success: {
    readonly status: 200 | 201 | 204;
    readonly description: string;
    /** Schema of `data` in the success envelope (omit for 204). */
    readonly schema?: z.ZodType;
  };
  /** Documented client error statuses; 401/403 are added for protected routes, 500/503 always. */
  readonly errors?: readonly (400 | 401 | 403 | 404 | 409 | 429)[];
  /** Returns the response `data` (ignored for 204). */
  handle(input: RouteInput<S>, req: Request, res: Response): Promise<unknown>;
}

export function defineRoute<S extends RequestSchemas>(
  route: RouteDefinition<S>,
): RouteDefinition<S> {
  return route;
}

/** A group of endpoints mounted under `/api/v1{basePath}` and shown as one Swagger tag. */
export interface ApiModule {
  readonly basePath: string;
  readonly tag: string;
  readonly description: string;
  /** Default access for the module's routes (default 'user'). */
  readonly access?: RouteAccess;
  readonly routes: readonly RouteDefinition[];
}

export function routeAccess(module: ApiModule, route: RouteDefinition): RouteAccess {
  return route.access ?? module.access ?? 'user';
}

export function createModuleRouter(module: ApiModule, accessGuard: AccessGuard): Router {
  // mergeParams exposes parent path params such as :productId to nested modules.
  const router = Router({ mergeParams: true });
  for (const route of module.routes) {
    const access = routeAccess(module, route);
    const guards =
      access === 'public' ? [] : [accessGuard(access, route.allowPendingPasswordChange ?? false)];
    router[route.method](route.path, ...guards, validateRequest(route.schemas), async (req, res) => {
      const input = res.locals['input'] as ValidatedInput;
      const data = await route.handle(input as RouteInput<RequestSchemas>, req, res);
      sendSuccess(res, route.success.status, data);
    });
  }
  return router;
}

export function createApiRouter(
  modules: readonly ApiModule[],
  options: { accessGuard: AccessGuard },
): Router {
  const router = Router();
  for (const module of modules) {
    router.use(module.basePath, createModuleRouter(module, options.accessGuard));
  }
  return router;
}

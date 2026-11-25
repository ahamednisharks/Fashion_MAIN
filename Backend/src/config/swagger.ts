import { z } from 'zod';

import { type ApiModule, type RouteDefinition, routeAccess } from '../common/http/route.js';
import { errorEnvelopeSchema, successEnvelope } from '../common/utils/response.js';

type JsonObject = Record<string, unknown>;

export const API_PREFIX = '/api/v1';

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed (`VALIDATION`) or malformed request (`BAD_REQUEST`).',
  401: 'Not signed in or session expired (`UNAUTHENTICATED`).',
  403: 'Not allowed (`FORBIDDEN`), temporary password must be changed first (`PASSWORD_CHANGE_REQUIRED`) or missing CSRF header (`CSRF_FAILED`).',
  429: 'Too many failed sign-in attempts (`TOO_MANY_REQUESTS`).',
  404: 'Record not found (`NOT_FOUND`).',
  409: 'Duplicate value (`DUPLICATE`) or record in use (`IN_USE`).',
  500: 'Unexpected server error (`INTERNAL_ERROR`).',
  503: 'Database unavailable (`SERVICE_UNAVAILABLE`).',
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rewrites Zod's local `#/$defs/X` references to OpenAPI component references. */
function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteRefs);
  }
  if (!isObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      key === '$ref' && typeof inner === 'string'
        ? inner.replace('#/$defs/', '#/components/schemas/')
        : rewriteRefs(inner),
    ]),
  );
}

/** Converts a Zod schema to an OpenAPI 3.1 schema, collecting named schemas into components. */
function toOpenApiSchema(
  schema: z.ZodType,
  io: 'input' | 'output',
  components: JsonObject,
): JsonObject {
  const json = z.toJSONSchema(schema, {
    io,
    target: 'draft-2020-12',
    unrepresentable: 'any',
    override: (ctx) => {
      // Dates are serialised as ISO-8601 strings in JSON responses.
      if (ctx.zodSchema._zod.def.type === 'date') {
        ctx.jsonSchema['type'] = 'string';
        ctx.jsonSchema['format'] = 'date-time';
      }
    },
  }) as JsonObject;
  delete json['$schema'];
  const defs = json['$defs'];
  delete json['$defs'];
  if (isObject(defs)) {
    for (const [name, definition] of Object.entries(defs)) {
      components[name] = rewriteRefs(definition);
    }
  }
  return rewriteRefs(json) as JsonObject;
}

function parameters(
  schema: z.ZodType | undefined,
  location: 'path' | 'query',
  components: JsonObject,
) {
  if (!schema) {
    return [];
  }
  const json = toOpenApiSchema(schema, 'input', components);
  const properties = isObject(json['properties']) ? json['properties'] : {};
  const required = Array.isArray(json['required']) ? (json['required'] as string[]) : [];
  return Object.entries(properties).map(([name, property]) => {
    const { description, ...propertySchema } = isObject(property) ? property : {};
    return {
      name,
      in: location,
      required: location === 'path' || required.includes(name),
      ...(typeof description === 'string' ? { description } : {}),
      schema: propertySchema,
    };
  });
}

function operation(module: ApiModule, route: RouteDefinition, components: JsonObject): JsonObject {
  const responses: JsonObject = {};
  const { success } = route;
  responses[String(success.status)] =
    success.status === 204 || !success.schema
      ? { description: success.description }
      : {
          description: success.description,
          content: {
            'application/json': {
              schema: toOpenApiSchema(successEnvelope(success.schema), 'output', components),
            },
          },
        };
  const isProtected = routeAccess(module, route) !== 'public';
  const statuses = new Set<number>([
    ...(route.errors ?? []),
    ...(isProtected ? [401, 403] : []),
    500,
    503,
  ]);
  for (const status of [...statuses].sort()) {
    responses[String(status)] = {
      description: ERROR_DESCRIPTIONS[status],
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
    };
  }

  return {
    tags: [module.tag],
    ...(isProtected ? {} : { security: [] }),
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    operationId: `${route.method}${(module.basePath + route.path).replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
    parameters: [
      ...parameters(route.schemas.params, 'path', components),
      ...parameters(route.schemas.query, 'query', components),
    ],
    ...(route.schemas.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: toOpenApiSchema(route.schemas.body, 'input', components),
              },
            },
          },
        }
      : {}),
    responses,
  };
}

/** Builds the OpenAPI 3.1 document from the same route definitions that serve the API. */
export function buildOpenApiDocument(modules: readonly ApiModule[], version: string): JsonObject {
  const components: JsonObject = {};
  toOpenApiSchema(errorEnvelopeSchema, 'output', components);
  const paths: Record<string, JsonObject> = {};

  for (const module of modules) {
    for (const route of module.routes) {
      const fullPath =
        `${API_PREFIX}${module.basePath}${route.path === '/' ? '' : route.path}`.replace(
          /:([A-Za-z_]+)/g,
          '{$1}',
        );
      paths[fullPath] = {
        ...paths[fullPath],
        [route.method]: operation(module, route, components),
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Fashion API',
      version,
      description:
        'REST API for Fashion — dress shop management software. Phase 1: master data.\n\n' +
        'Responses use the envelope `{ "success": true, "data": … }`; errors use ' +
        '`{ "success": false, "error": { "code", "message", "field"?, "details"? } }`.',
    },
    servers: [{ url: '/' }],
    tags: modules.map((module) => ({ name: module.tag, description: module.description })),
    paths,
    // Every route requires the session cookie unless it declares `security: []` (public).
    security: [{ sessionCookie: [] }],
    components: {
      schemas: components,
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'fashion_session',
          description:
            'Set by POST /api/v1/auth/login. Use "Try it out" on that endpoint to sign in.',
        },
      },
    },
  };
}

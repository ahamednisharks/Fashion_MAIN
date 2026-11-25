import type { QueryResultRow } from 'pg';
import { z } from 'zod';

import { type ApiModule, defineRoute } from '../http/route.js';
import { pagedSchema } from '../utils/pagination.js';
import {
  type BaseListQuery,
  existsResultSchema,
  idParamsSchema,
  lookupQuerySchema,
  statusBodySchema,
} from '../validators/list-query.js';
import type { ExistsQuery, MasterController } from './master.controller.js';

export interface MasterModuleConfig<
  TEntity extends QueryResultRow,
  TInput,
  TQuery extends BaseListQuery,
> {
  readonly basePath: string;
  readonly tag: string;
  readonly description: string;
  /** Lower-case nouns for docs, e.g. "category" / "categories". */
  readonly noun: string;
  readonly plural: string;
  readonly controller: MasterController<TEntity, TInput, TQuery>;
  readonly entitySchema: z.ZodType;
  readonly inputSchema: z.ZodType<TInput>;
  readonly listQuerySchema: z.ZodType<TQuery>;
  readonly existsQuerySchema: z.ZodType<ExistsQuery>;
}

/**
 * Standard REST endpoints for a master resource:
 *   GET    /            list (search, status, filters, sort, pagination)
 *   GET    /lookup      all records for dropdowns
 *   GET    /exists      duplicate check for forms
 *   GET    /:id         details
 *   POST   /            create
 *   PUT    /:id         replace
 *   PATCH  /:id/status  activate / deactivate
 *   DELETE /:id         delete (409 IN_USE when referenced)
 */
export function createMasterModule<
  TEntity extends QueryResultRow,
  TInput,
  TQuery extends BaseListQuery,
>(config: MasterModuleConfig<TEntity, TInput, TQuery>): ApiModule {
  const { controller, noun, plural, entitySchema } = config;
  return {
    basePath: config.basePath,
    tag: config.tag,
    description: config.description,
    routes: [
      defineRoute({
        method: 'get',
        path: '/',
        summary: `List ${plural}`,
        description: 'Paginated list with search, status filter and sorting.',
        schemas: { query: config.listQuerySchema },
        success: {
          status: 200,
          description: `A page of ${plural}.`,
          schema: pagedSchema(entitySchema),
        },
        errors: [400],
        handle: ({ query }) => controller.list(query),
      }),
      defineRoute({
        method: 'get',
        path: '/lookup',
        summary: `All ${plural} (for dropdowns)`,
        description: 'Unpaginated, in default order.',
        schemas: { query: lookupQuerySchema },
        success: { status: 200, description: `All ${plural}.`, schema: z.array(entitySchema) },
        errors: [400],
        handle: ({ query }) => controller.lookup(query),
      }),
      defineRoute({
        method: 'get',
        path: '/exists',
        summary: `Check whether a ${noun} value is already used`,
        description: 'Case-insensitive. Pass excludeId when editing an existing record.',
        schemas: { query: config.existsQuerySchema },
        success: {
          status: 200,
          description: 'Whether the value exists.',
          schema: existsResultSchema,
        },
        errors: [400],
        handle: ({ query }) => controller.exists(query),
      }),
      defineRoute({
        method: 'get',
        path: '/:id',
        summary: `Get a ${noun}`,
        schemas: { params: idParamsSchema },
        success: { status: 200, description: `The ${noun}.`, schema: entitySchema },
        errors: [400, 404],
        handle: ({ params }) => controller.getById(params),
      }),
      defineRoute({
        method: 'post',
        path: '/',
        summary: `Create a ${noun}`,
        schemas: { body: config.inputSchema },
        success: { status: 201, description: `The created ${noun}.`, schema: entitySchema },
        errors: [400, 409],
        handle: ({ body }) => controller.create(body),
      }),
      defineRoute({
        method: 'put',
        path: '/:id',
        summary: `Update a ${noun}`,
        description: 'Replaces all editable fields.',
        schemas: { params: idParamsSchema, body: config.inputSchema },
        success: { status: 200, description: `The updated ${noun}.`, schema: entitySchema },
        errors: [400, 404, 409],
        handle: ({ params, body }) => controller.update(params, body),
      }),
      defineRoute({
        method: 'patch',
        path: '/:id/status',
        summary: `Activate or deactivate a ${noun}`,
        schemas: { params: idParamsSchema, body: statusBodySchema },
        success: { status: 200, description: `The updated ${noun}.`, schema: entitySchema },
        errors: [400, 404],
        handle: ({ params, body }) => controller.setStatus(params, body),
      }),
      defineRoute({
        method: 'delete',
        path: '/:id',
        summary: `Delete a ${noun}`,
        description:
          'Fails with 409 IN_USE when other records reference it — deactivate it instead.',
        schemas: { params: idParamsSchema },
        success: { status: 204, description: 'Deleted.' },
        errors: [400, 404, 409],
        handle: ({ params }) => controller.remove(params),
      }),
    ],
  };
}

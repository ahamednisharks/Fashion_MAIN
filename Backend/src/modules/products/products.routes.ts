import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import {
  existsResultSchema,
  idParamsSchema,
  lookupQuerySchema,
  statusBodySchema,
} from '../../common/validators/list-query.js';
import { productsController as controller } from './products.controller.js';
import {
  productExistsQuerySchema,
  productInputSchema,
  productListQuerySchema,
  productSchema,
  productSummarySchema,
} from './products.schema.js';

export const productsModule: ApiModule = {
  basePath: '/products',
  tag: 'Products',
  description:
    'Products with their design / size / colour variants. Product code, SKUs and barcodes are unique ' +
    'across the catalogue.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'List products',
      description:
        'Paginated summaries (no variants) with category / brand names and variant count. ' +
        'Search matches name, code, barcode, HSN, category, brand and variant SKU / barcode / design.',
      schemas: { query: productListQuerySchema },
      success: {
        status: 200,
        description: 'A page of products.',
        schema: pagedSchema(productSummarySchema),
      },
      errors: [400],
      handle: ({ query }) => controller.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/lookup',
      summary: 'All products (summaries)',
      schemas: { query: lookupQuerySchema },
      success: { status: 200, description: 'All products.', schema: z.array(productSummarySchema) },
      errors: [400],
      handle: ({ query }) => controller.lookup(query),
    }),
    defineRoute({
      method: 'get',
      path: '/exists',
      summary: 'Check whether a product code, SKU or barcode is already used',
      description: 'For barcode / SKU, excludeId is a product ID whose own codes are ignored.',
      schemas: { query: productExistsQuerySchema },
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
      summary: 'Get a product with its variants',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The product.', schema: productSchema },
      errors: [400, 404],
      handle: ({ params }) => controller.getById(params),
    }),
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Create a product with its variants',
      description:
        'Saved in one transaction. Validation errors point at fields such as `variants.2.sku`.',
      schemas: { body: productInputSchema },
      success: { status: 201, description: 'The created product.', schema: productSchema },
      errors: [400, 409],
      handle: ({ body }) => controller.create(body),
    }),
    defineRoute({
      method: 'put',
      path: '/:id',
      summary: 'Update a product and synchronise its variants',
      description:
        'Variants with an `id` are updated, variants without one are added, and existing variants ' +
        'missing from the payload are deleted — all in one transaction.',
      schemas: { params: idParamsSchema, body: productInputSchema },
      success: { status: 200, description: 'The updated product.', schema: productSchema },
      errors: [400, 404, 409],
      handle: ({ params, body }) => controller.update(params, body),
    }),
    defineRoute({
      method: 'patch',
      path: '/:id/status',
      summary: 'Activate or deactivate a product',
      schemas: { params: idParamsSchema, body: statusBodySchema },
      success: { status: 200, description: 'The updated product.', schema: productSchema },
      errors: [400, 404],
      handle: ({ params, body }) => controller.setStatus(params, body),
    }),
    defineRoute({
      method: 'delete',
      path: '/:id',
      summary: 'Delete a product and its variants',
      schemas: { params: idParamsSchema },
      success: { status: 204, description: 'Deleted.' },
      errors: [400, 404],
      handle: ({ params }) => controller.remove(params),
    }),
  ],
};

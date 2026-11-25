import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../../common/http/route.js';
import { variantsController as controller } from './variants.controller.js';
import {
  productParamsSchema,
  variantInputSchema,
  variantParamsSchema,
  variantSchema,
} from './variants.schema.js';

export const variantsModule: ApiModule = {
  basePath: '/products/:productId/variants',
  tag: 'Product variants',
  description:
    'Manage one variant at a time. To save a product together with all its variants, use PUT /products/{id}.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/',
      summary: "List a product's variants",
      description: 'In display order.',
      schemas: { params: productParamsSchema },
      success: { status: 200, description: 'Variants.', schema: z.array(variantSchema) },
      errors: [400, 404],
      handle: ({ params }) => controller.list(params),
    }),
    defineRoute({
      method: 'get',
      path: '/:variantId',
      summary: 'Get a variant',
      schemas: { params: variantParamsSchema },
      success: { status: 200, description: 'The variant.', schema: variantSchema },
      errors: [400, 404],
      handle: ({ params }) => controller.getById(params),
    }),
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Add a variant',
      description:
        'SKU and barcode must be unique across the catalogue; selling price ≤ MRP after overrides.',
      schemas: { params: productParamsSchema, body: variantInputSchema },
      success: { status: 201, description: 'The created variant.', schema: variantSchema },
      errors: [400, 404, 409],
      handle: ({ params, body }) => controller.create(params, body),
    }),
    defineRoute({
      method: 'put',
      path: '/:variantId',
      summary: 'Update a variant',
      schemas: { params: variantParamsSchema, body: variantInputSchema },
      success: { status: 200, description: 'The updated variant.', schema: variantSchema },
      errors: [400, 404, 409],
      handle: ({ params, body }) => controller.update(params, body),
    }),
    defineRoute({
      method: 'delete',
      path: '/:variantId',
      summary: 'Delete a variant',
      schemas: { params: variantParamsSchema },
      success: { status: 204, description: 'Deleted.' },
      errors: [400, 404],
      handle: ({ params }) => controller.remove(params),
    }),
  ],
};

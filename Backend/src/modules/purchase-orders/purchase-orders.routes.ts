import type { Response } from 'express';
import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import { idParamsSchema } from '../../common/validators/list-query.js';
import { currentAuth } from '../auth/auth.middleware.js';
import { itemLookupQuerySchema, itemSearchQuerySchema } from '../sales/sales.schema.js';
import { type PoAuthor, purchaseOrdersService as service } from './purchase-orders.service.js';
import {
  nextNumberQuerySchema,
  nextNumberSchema,
  poInputSchema,
  poListQuerySchema,
  poSchema,
  poSummarySchema,
  purchasableItemSchema,
} from './purchase-orders.schema.js';

const author = (res: Response): PoAuthor => {
  const { user } = currentAuth(res);
  return { id: user.id, fullName: user.fullName };
};

export const purchaseOrdersModule: ApiModule = {
  basePath: '/purchase-orders',
  tag: 'Purchase orders',
  access: 'admin',
  description:
    'Purchase orders to suppliers (administrators only). Rates are GST exclusive; numbers run ' +
    'PO-<financial year start>-<n> (e.g. PO-2026-00001) without gaps. A PO does not change stock.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/items/lookup',
      summary: 'Find items by an exact barcode, SKU or product code (with purchase rate)',
      description: 'Same matching as billing; inactive products are flagged (status = inactive).',
      schemas: { query: itemLookupQuerySchema },
      success: {
        status: 200,
        description: 'Matching items.',
        schema: z.array(purchasableItemSchema),
      },
      errors: [400],
      handle: ({ query }) => service.lookupItems(query.code),
    }),
    defineRoute({
      method: 'get',
      path: '/items',
      summary: 'Search items to order (typed text, with purchase rate)',
      description: 'Active products only; every word must match.',
      schemas: { query: itemSearchQuerySchema },
      success: {
        status: 200,
        description: 'Matching items.',
        schema: z.array(purchasableItemSchema),
      },
      errors: [400],
      handle: ({ query }) => service.searchItems(query.search, query.limit),
    }),
    defineRoute({
      method: 'get',
      path: '/next-number',
      summary: 'Preview the next PO number',
      description: 'Not reserved — another PO saved first takes it.',
      schemas: { query: nextNumberQuerySchema },
      success: { status: 200, description: 'The next number.', schema: nextNumberSchema },
      errors: [400],
      handle: ({ query }) => service.nextNumber(query),
    }),
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'List purchase orders (newest first)',
      schemas: { query: poListQuerySchema },
      success: {
        status: 200,
        description: 'A page of purchase orders.',
        schema: pagedSchema(poSummarySchema),
      },
      errors: [400],
      handle: ({ query }) => service.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/:id',
      summary: 'Get a purchase order with its lines',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The purchase order.', schema: poSchema },
      errors: [400, 404],
      handle: ({ params }) => service.get(params.id),
    }),
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Create a purchase order',
      description:
        'Amounts are computed on the server. Refused (400) for an inactive supplier or item, a ' +
        'future PO date, an expected date before the PO date, or the same item on two lines.',
      schemas: { body: poInputSchema },
      success: { status: 201, description: 'The saved purchase order.', schema: poSchema },
      errors: [400],
      handle: ({ body }, _req, res) => service.create(body, author(res)),
    }),
    defineRoute({
      method: 'put',
      path: '/:id',
      summary: 'Change an open purchase order',
      description:
        'Only open POs with nothing received. The PO date must stay in the financial year of ' +
        'its number.',
      schemas: { params: idParamsSchema, body: poInputSchema },
      success: { status: 200, description: 'The updated purchase order.', schema: poSchema },
      errors: [400, 404],
      handle: ({ params, body }, _req, res) => service.update(params.id, body, author(res)),
    }),
    defineRoute({
      method: 'post',
      path: '/:id/cancel',
      summary: 'Cancel a purchase order',
      description: 'Only open POs with nothing received. Cancelled POs are kept (never deleted).',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The cancelled purchase order.', schema: poSchema },
      errors: [400, 404],
      handle: ({ params }, _req, res) => service.cancel(params.id, author(res)),
    }),
  ],
};

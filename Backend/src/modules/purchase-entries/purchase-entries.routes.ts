import type { Response } from 'express';
import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import { idParamsSchema } from '../../common/validators/list-query.js';
import { currentAuth } from '../auth/auth.middleware.js';
import {
  poSummarySchema,
  receivableOrderSchema,
} from '../purchase-orders/purchase-orders.schema.js';
import { type PeAuthor, purchaseEntriesService as service } from './purchase-entries.service.js';
import {
  peInputSchema,
  peLabelItemSchema,
  peListQuerySchema,
  peNextNumberQuerySchema,
  peNextNumberSchema,
  peSchema,
  peSummarySchema,
  receivableOrdersQuerySchema,
} from './purchase-entries.schema.js';

const author = (res: Response): PeAuthor => {
  const { user } = currentAuth(res);
  return { id: user.id, fullName: user.fullName };
};

export const purchaseEntriesModule: ApiModule = {
  basePath: '/purchase-entries',
  tag: 'Purchase entries',
  access: 'admin',
  description:
    'Goods received from suppliers, entered from the supplier invoice (administrators only) — ' +
    'against a purchase order of the same supplier or directly. Rates are GST exclusive; numbers ' +
    'run PE-<financial year start>-<n> (e.g. PE-2026-00001) without gaps. Saving updates the ' +
    "PO's received quantities and status and the items' purchase rate, MRP and selling price. " +
    'Items to receive are searched with /purchase-orders/items.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/next-number',
      summary: 'Preview the next PE number',
      description: 'Not reserved — another entry saved first takes it.',
      schemas: { query: peNextNumberQuerySchema },
      success: { status: 200, description: 'The next number.', schema: peNextNumberSchema },
      errors: [400],
      handle: ({ query }) => service.nextNumber(query),
    }),
    defineRoute({
      method: 'get',
      path: '/orders',
      summary: 'Purchase orders that can be received against',
      description:
        'Open and partly received POs — of one supplier, or of all suppliers — newest first ' +
        '(at most 200).',
      schemas: { query: receivableOrdersQuerySchema },
      success: {
        status: 200,
        description: 'Purchase orders.',
        schema: z.array(poSummarySchema),
      },
      errors: [400],
      handle: ({ query }) => service.receivableOrders(query.supplierId),
    }),
    defineRoute({
      method: 'get',
      path: '/orders/:id',
      summary: 'A purchase order as items to receive',
      description:
        'Each PO line with the item as it is now (prices, status), the ordered quantity and ' +
        'what saved entries have received so far.',
      schemas: { params: idParamsSchema },
      success: {
        status: 200,
        description: 'The purchase order.',
        schema: receivableOrderSchema,
      },
      errors: [400, 404],
      handle: ({ params }) => service.receivableOrder(params.id),
    }),
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'List purchase entries (newest first)',
      schemas: { query: peListQuerySchema },
      success: {
        status: 200,
        description: 'A page of purchase entries.',
        schema: pagedSchema(peSummarySchema),
      },
      errors: [400],
      handle: ({ query }) => service.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/:id',
      summary: 'Get a purchase entry with its lines',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The purchase entry.', schema: peSchema },
      errors: [400, 404],
      handle: ({ params }) => service.get(params.id),
    }),
    defineRoute({
      method: 'get',
      path: '/:id/labels',
      summary: 'Items of an entry for price labels',
      description:
        'The items as they are now (current barcode and prices) with the received quantity as ' +
        'the number of labels (1 for fabric).',
      schemas: { params: idParamsSchema },
      success: {
        status: 200,
        description: 'Items with label copies.',
        schema: z.array(peLabelItemSchema),
      },
      errors: [400, 404],
      handle: ({ params }) => service.labels(params.id),
    }),
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Save a purchase entry',
      description:
        'Amounts are computed on the server. Refused (400) for an inactive supplier or item, a ' +
        'future received date, an invoice date after the received date, a PO of another ' +
        'supplier / cancelled / fully received, a selling price above the MRP, or the same item ' +
        'on two lines; 409 when the supplier invoice is already entered this financial year.',
      schemas: { body: peInputSchema },
      success: { status: 201, description: 'The saved purchase entry.', schema: peSchema },
      errors: [400, 409],
      handle: ({ body }, _req, res) => service.create(body, author(res)),
    }),
    defineRoute({
      method: 'put',
      path: '/:id',
      summary: 'Change a purchase entry',
      description:
        'Not for cancelled entries. The received date must stay in the financial year of its ' +
        'number. PO quantities are recomputed (also for a PO the entry no longer refers to).',
      schemas: { params: idParamsSchema, body: peInputSchema },
      success: { status: 200, description: 'The updated purchase entry.', schema: peSchema },
      errors: [400, 404, 409],
      handle: ({ params, body }, _req, res) => service.update(params.id, body, author(res)),
    }),
    defineRoute({
      method: 'post',
      path: '/:id/cancel',
      summary: 'Cancel a purchase entry',
      description:
        'The entry is kept (never deleted) but no longer counts as received; item prices it ' +
        'set stay as they are.',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The cancelled purchase entry.', schema: peSchema },
      errors: [400, 404],
      handle: ({ params }, _req, res) => service.cancel(params.id, author(res)),
    }),
  ],
};

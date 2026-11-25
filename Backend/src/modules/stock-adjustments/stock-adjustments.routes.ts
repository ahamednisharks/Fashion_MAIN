import type { Response } from 'express';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import { idParamsSchema } from '../../common/validators/list-query.js';
import { currentAuth } from '../auth/auth.middleware.js';
import {
  type AdjustmentAuthor,
  stockAdjustmentsService as service,
} from './stock-adjustments.service.js';
import {
  adjustmentInputSchema,
  adjustmentItemsQuerySchema,
  adjustmentItemsSchema,
  adjustmentListQuerySchema,
  adjustmentNextNumberQuerySchema,
  adjustmentNextNumberSchema,
  adjustmentSchema,
  adjustmentSummarySchema,
} from './stock-adjustments.schema.js';

const author = (res: Response): AdjustmentAuthor => {
  const { user } = currentAuth(res);
  return { id: user.id, fullName: user.fullName };
};

export const stockAdjustmentsModule: ApiModule = {
  basePath: '/stock-adjustments',
  tag: 'Stock adjustments',
  access: 'admin',
  description:
    'Changes to stock that no purchase entry or bill explains — opening stock, stock counts, ' +
    'damaged / lost / found goods (administrators only). In count mode the quantity counted ' +
    'is entered and the stock changes by counted − in stock; in change mode the quantity to ' +
    'add (+) or take out (−). Numbers run ADJ-<financial year start>-<n> (e.g. ' +
    'ADJ-2026-00001) without gaps. Adjustments are not edited: cancel and enter again. Items ' +
    'are scanned / searched with /purchase-orders/items (they come with the purchase price).',
  routes: [
    defineRoute({
      method: 'get',
      path: '/next-number',
      summary: 'Preview the next ADJ number',
      description: 'Not reserved — another adjustment saved first takes it.',
      schemas: { query: adjustmentNextNumberQuerySchema },
      success: {
        status: 200,
        description: 'The next number.',
        schema: adjustmentNextNumberSchema,
      },
      errors: [400],
      handle: ({ query }) => service.nextNumber(query),
    }),
    defineRoute({
      method: 'get',
      path: '/items',
      summary: 'Items to load onto an adjustment',
      description:
        'Items of a category or brand, or in a stock state (e.g. below zero), with their stock ' +
        'and purchase price — in the order of the Items screen (at most `limit`).',
      schemas: { query: adjustmentItemsQuerySchema },
      success: { status: 200, description: 'Items.', schema: adjustmentItemsSchema },
      errors: [400],
      handle: ({ query }) => service.items(query),
    }),
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'List stock adjustments (newest first)',
      schemas: { query: adjustmentListQuerySchema },
      success: {
        status: 200,
        description: 'A page of stock adjustments.',
        schema: pagedSchema(adjustmentSummarySchema),
      },
      errors: [400],
      handle: ({ query }) => service.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/:id',
      summary: 'Get a stock adjustment with its lines',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The stock adjustment.', schema: adjustmentSchema },
      errors: [400, 404],
      handle: ({ params }) => service.get(params.id),
    }),
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Save a stock adjustment',
      description:
        'The change of each line is worked out on the server from the stock at save time. ' +
        'Refused (400) for a future date, an item listed twice, a missing / zero quantity, ' +
        'decimals on a non-fabric item, Other without notes, damaged / lost goods going up or ' +
        "found goods going down — and, in count mode, when an item's stock differs from the " +
        '`systemQuantity` sent (a bill or entry was saved meanwhile: the details name each line).',
      schemas: { body: adjustmentInputSchema },
      success: { status: 201, description: 'The saved adjustment.', schema: adjustmentSchema },
      errors: [400],
      handle: ({ body }, _req, res) => service.create(body, author(res)),
    }),
    defineRoute({
      method: 'post',
      path: '/:id/cancel',
      summary: 'Cancel a stock adjustment',
      description: 'The adjustment is kept (never deleted) but its stock changes are reversed.',
      schemas: { params: idParamsSchema },
      success: {
        status: 200,
        description: 'The cancelled adjustment.',
        schema: adjustmentSchema,
      },
      errors: [400, 404],
      handle: ({ params }, _req, res) => service.cancel(params.id, author(res)),
    }),
  ],
};

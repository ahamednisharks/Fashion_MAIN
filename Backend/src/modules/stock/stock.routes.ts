import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { stockService as service } from './stock.service.js';
import {
  stockHistoryQuerySchema,
  stockHistorySchema,
  stockLevelSchema,
  stockLevelsInputSchema,
} from './stock.schema.js';

export const stockModule: ApiModule = {
  basePath: '/stock',
  tag: 'Stock',
  description:
    'Quantity in hand per item, kept from a ledger of stock movements: purchase entries add, ' +
    'bills take away, stock adjustments correct it either way. The quantity in hand is also on ' +
    'every item (`stock` on /items, /sales/items, /purchase-orders/items).',
  routes: [
    defineRoute({
      method: 'get',
      path: '/history',
      summary: "An item's stock movements",
      description:
        'Newest first, each with the balance after it, plus the quantity in hand now. Any ' +
        'signed-in user (no costs are shown).',
      schemas: { query: stockHistoryQuerySchema },
      success: { status: 200, description: 'Stock history.', schema: stockHistorySchema },
      errors: [400, 404],
      handle: ({ query }) => service.history(query),
    }),
    defineRoute({
      method: 'post',
      path: '/levels',
      summary: 'Quantity in hand of several items',
      description:
        'In the order given — for screens refreshing the stock they show (e.g. a stock count ' +
        'refused because the stock moved meanwhile). POST because the list can be long; ' +
        'nothing is changed.',
      schemas: { body: stockLevelsInputSchema },
      success: {
        status: 200,
        description: 'Stock of each item.',
        schema: z.array(stockLevelSchema),
      },
      errors: [400],
      handle: ({ body }) => service.levels(body),
    }),
  ],
};

import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import { idParamsSchema } from '../../common/validators/list-query.js';
import { salesController as controller } from './sales.controller.js';
import {
  invoiceInputSchema,
  invoiceListQuerySchema,
  invoiceSchema,
  invoiceSummarySchema,
  itemLookupQuerySchema,
  itemSearchQuerySchema,
  sellableItemSchema,
} from './sales.schema.js';

export const salesModule: ApiModule = {
  basePath: '/sales',
  tag: 'Sales (billing)',
  description:
    'Counter billing: find items by barcode / SKU or text, save bills (GST-inclusive prices, ' +
    'numbered INV/<financial year>/<n> without gaps) and read them back for printing.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/items/lookup',
      summary: 'Find items by an exact barcode, SKU or product code (scanner)',
      description:
        'Empty array when nothing matches. A product barcode / code returns every variant of ' +
        'that product. Inactive products are included (status = inactive) so the counter can ' +
        'explain why they cannot be billed.',
      schemas: { query: itemLookupQuerySchema },
      success: { status: 200, description: 'Matching items.', schema: z.array(sellableItemSchema) },
      errors: [400],
      handle: ({ query }) => controller.lookupItems(query),
    }),
    defineRoute({
      method: 'get',
      path: '/items',
      summary: 'Search sellable items (typed text)',
      description: 'Active products only; every word must match.',
      schemas: { query: itemSearchQuerySchema },
      success: { status: 200, description: 'Matching items.', schema: z.array(sellableItemSchema) },
      errors: [400],
      handle: ({ query }) => controller.searchItems(query),
    }),
    defineRoute({
      method: 'get',
      path: '/invoices',
      summary: 'List bills (newest first)',
      schemas: { query: invoiceListQuerySchema },
      success: {
        status: 200,
        description: 'A page of bills.',
        schema: pagedSchema(invoiceSummarySchema),
      },
      errors: [400],
      handle: ({ query }) => controller.listInvoices(query),
    }),
    defineRoute({
      method: 'get',
      path: '/invoices/:id',
      summary: 'Get a bill with its lines and payments',
      schemas: { params: idParamsSchema },
      success: { status: 200, description: 'The bill.', schema: invoiceSchema },
      errors: [400, 404],
      handle: ({ params }) => controller.getInvoice(params),
    }),
    defineRoute({
      method: 'post',
      path: '/invoices',
      summary: 'Save a bill',
      description:
        'Prices, tax and totals are recomputed on the server. Refused (400) when an item is ' +
        'inactive, its price changed since it was added (`items.N.unitPrice`), or the payments ' +
        "don't cover the bill (`payments`).",
      schemas: { body: invoiceInputSchema },
      success: { status: 201, description: 'The saved bill.', schema: invoiceSchema },
      errors: [400],
      handle: ({ body }, _req, res) => controller.createInvoice(body, res),
    }),
  ],
};

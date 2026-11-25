import { z } from 'zod';

import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { pagedSchema } from '../../common/utils/pagination.js';
import { itemsService as service } from './items.service.js';
import {
  barcodeAssignmentSchema,
  barcodeAssignmentsInputSchema,
  barcodeSettingsInputSchema,
  barcodeSettingsSchema,
  catalogItemSchema,
  itemCountsSchema,
  itemListQuerySchema,
} from './items.schema.js';

export const itemsModule: ApiModule = {
  basePath: '/items',
  tag: 'Items',
  description:
    'Items = what is sold and labelled: one per product variant, or one per product without ' +
    'variants. Products (and their variants) are still created and edited under /products.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'List items',
      description:
        'Search matches name, product code, SKU, barcode, design no., brand, category, size and ' +
        'colour (every word must match). Variants of a product stay together in their own order.',
      schemas: { query: itemListQuerySchema },
      success: {
        status: 200,
        description: 'A page of items.',
        schema: pagedSchema(catalogItemSchema),
      },
      errors: [400],
      handle: ({ query }) => service.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/counts',
      summary: 'Count items (and active items without a barcode)',
      schemas: {},
      success: { status: 200, description: 'Item counts.', schema: itemCountsSchema },
      handle: () => service.counts(),
    }),
    defineRoute({
      method: 'post',
      path: '/barcodes',
      summary: 'Give items a barcode',
      description:
        "Each row sets the barcode sent (e.g. the maker's, scanned) or, when it is empty, the " +
        "shop's next EAN-13 number (200…). All or nothing; errors name the row as " +
        '`items.<n>.barcode`. An item that already has a barcode needs `replace: true`.',
      schemas: { body: barcodeAssignmentsInputSchema },
      success: {
        status: 200,
        description: 'The barcode of every row after the save, in request order.',
        schema: z.array(barcodeAssignmentSchema),
      },
      errors: [400, 409],
      handle: ({ body }) => service.assign(body),
    }),
  ],
};

export const barcodeSettingsModule: ApiModule = {
  basePath: '/settings',
  tag: 'Barcode settings',
  description: 'Shop barcode numbering and the price-label layout.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/barcodes',
      summary: 'Get barcode numbering and label settings',
      schemas: {},
      success: { status: 200, description: 'The settings.', schema: barcodeSettingsSchema },
      handle: () => service.settings(),
    }),
    defineRoute({
      method: 'put',
      path: '/barcodes',
      summary: 'Update barcode numbering and label settings',
      description:
        'Administrators only. The running number is never reset (barcodes already printed keep ' +
        'working); changing the prefix starts using the new prefix from the next barcode.',
      access: 'admin',
      schemas: { body: barcodeSettingsInputSchema },
      success: { status: 200, description: 'The saved settings.', schema: barcodeSettingsSchema },
      errors: [400],
      handle: ({ body }) => service.saveSettings(body),
    }),
  ],
};

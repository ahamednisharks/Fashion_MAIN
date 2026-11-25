import { z } from 'zod';

import { uuidField } from '../../common/validators/fields.js';

export const STOCK_SOURCE_TYPES = ['purchase_entry', 'sales_invoice', 'stock_adjustment'] as const;
export type StockSourceType = (typeof STOCK_SOURCE_TYPES)[number];

export const STOCK_MOVEMENT_KINDS = ['purchase', 'sale', 'adjustment'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export const MAX_HISTORY = 500;
export const MAX_LEVEL_ITEMS = 1000;

export const stockHistoryQuerySchema = z.object({
  productId: uuidField('Product'),
  variantId: uuidField('Variant')
    .optional()
    .describe('The variant; leave out for a product without variants.'),
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY).default(200),
});
export type StockHistoryQuery = z.infer<typeof stockHistoryQuerySchema>;

export const stockMovementSchema = z
  .object({
    date: z.iso.date().describe('Date of the document (received on / bill date).'),
    kind: z.enum(STOCK_MOVEMENT_KINDS),
    sourceType: z.enum(STOCK_SOURCE_TYPES),
    sourceId: z.uuid(),
    sourceNo: z.string().describe('e.g. PE-2026-00001 or INV/26-27/00012.'),
    quantity: z.number().describe('+ in, − out.'),
    balance: z.number().describe('Quantity in hand after this movement.'),
    createdAt: z.date(),
  })
  .meta({ id: 'StockMovement' });

export const stockHistorySchema = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid().nullable(),
    stock: z.number().describe('Quantity in hand now.'),
    totalMovements: z.number().int(),
    movements: z.array(stockMovementSchema).describe('Newest first (at most `limit`).'),
  })
  .meta({ id: 'StockHistory' });
export type StockHistory = z.infer<typeof stockHistorySchema>;

const stockItemShape = {
  productId: uuidField('Product'),
  variantId: uuidField('Variant')
    .nullish()
    .transform((value) => value ?? null)
    .describe('Null for products without variants.'),
};

export const stockLevelsInputSchema = z
  .object({
    items: z
      .array(z.object(stockItemShape))
      .min(1, { error: 'Give at least one item.' })
      .max(MAX_LEVEL_ITEMS, { error: `At most ${MAX_LEVEL_ITEMS} items at a time.` }),
  })
  .meta({ id: 'StockLevelsInput' });
export type StockLevelsInput = z.infer<typeof stockLevelsInputSchema>;

export const stockLevelSchema = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid().nullable(),
    stock: z.number().describe('Quantity in hand now (0 when the item never moved).'),
  })
  .meta({ id: 'StockLevel' });
export type StockLevel = z.infer<typeof stockLevelSchema>;

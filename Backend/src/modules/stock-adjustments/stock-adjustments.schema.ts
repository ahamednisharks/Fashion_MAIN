import { z } from 'zod';

import { optionalMoneyField, optionalText, uuidField } from '../../common/validators/fields.js';
import { MAX_PAGE_SIZE } from '../../common/validators/list-query.js';
import { PRODUCT_TYPES } from '../products/products.schema.js';
import { purchasableItemSchema } from '../purchase-orders/purchase-orders.schema.js';
import { MAX_QUANTITY, QUANTITY_DECIMALS } from '../sales/sales.schema.js';

/**
 * count = the quantity counted is entered (the stock changes by counted − in stock);
 * change = the quantity to add (+) or take out (−) is entered.
 */
export const ADJUSTMENT_MODES = ['count', 'change'] as const;
export type AdjustmentMode = (typeof ADJUSTMENT_MODES)[number];

export const ADJUSTMENT_REASONS = [
  'opening_stock',
  'stock_count',
  'damaged',
  'lost',
  'found',
  'other',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Readonly<Record<AdjustmentReason, string>> = {
  opening_stock: 'Opening stock',
  stock_count: 'Stock count',
  damaged: 'Damaged',
  lost: 'Lost / stolen',
  found: 'Found',
  other: 'Other',
};

/** Damaged and lost goods only leave stock; found goods only come in. */
export const ADJUSTMENT_DIRECTION: Readonly<Partial<Record<AdjustmentReason, 'in' | 'out'>>> = {
  damaged: 'out',
  lost: 'out',
  found: 'in',
};

/** posted = counts in stock; cancelled adjustments are kept but change nothing. */
export const ADJUSTMENT_STATUSES = ['posted', 'cancelled'] as const;
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

/** A whole category can be counted in one go. */
export const MAX_ADJUSTMENT_LINES = 1000;

const hasAtMostDecimals = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.abs(Math.round(value * factor) - value * factor) < 1e-6;
};

const isoDate = (label: string) =>
  z.iso.date({ error: `${label} must be a valid date (YYYY-MM-DD).` });

/** A quantity between `min` and MAX_QUANTITY with at most 3 decimals; null/undefined → null. */
function optionalQuantity(label: string, min: number, minMessage: string) {
  return z
    .number({ error: `${label} must be a number.` })
    .min(min, { error: minMessage })
    .max(MAX_QUANTITY, { error: `${label} cannot be more than ${MAX_QUANTITY}.` })
    .refine((value) => hasAtMostDecimals(value, QUANTITY_DECIMALS), {
      error: `${label} can have at most ${QUANTITY_DECIMALS} decimal places.`,
    })
    .nullish()
    .transform((value) => value ?? null);
}

// ---- Saving an adjustment ----------------------------------------------------------------------

export const adjustmentItemInputSchema = z.object({
  productId: uuidField('Product'),
  variantId: uuidField('Variant')
    .nullish()
    .transform((value) => value ?? null)
    .describe('Null for products without variants.'),
  countedQuantity: optionalQuantity(
    'Counted quantity',
    0,
    'Counted quantity cannot be negative.',
  ).describe('Count mode: the quantity counted (0 or more).'),
  quantity: optionalQuantity(
    'Quantity',
    -MAX_QUANTITY,
    `Quantity cannot be less than −${MAX_QUANTITY}.`,
  ).describe('Change mode: + to add to stock, − to take out (not 0).'),
  systemQuantity: z
    .number({ error: 'In stock must be a number.' })
    .nullish()
    .transform((value) => value ?? null)
    .describe(
      'Count mode: the stock the screen showed for the item. When it differs from the stock ' +
        'at save time (a bill or purchase entry was saved meanwhile) the adjustment is refused, ' +
        'so the count can be checked. Null = no check.',
    ),
  unitCost: optionalMoneyField('Cost').describe(
    'Cost of one piece, GST exclusive (usually the purchase price); null = not known.',
  ),
  note: optionalText('Note', 200),
});
export type AdjustmentItemInput = z.infer<typeof adjustmentItemInputSchema>;

export const adjustmentInputSchema = z
  .object({
    adjustmentDate: isoDate('Date').describe('Day of the count / damage / opening stock.'),
    mode: z.enum(ADJUSTMENT_MODES, { error: "Mode must be 'count' or 'change'." }),
    reason: z.enum(ADJUSTMENT_REASONS, { error: 'Choose a reason.' }),
    notes: optionalText('Notes', 500).describe('Required when the reason is Other.'),
    items: z
      .array(adjustmentItemInputSchema)
      .min(1, { error: 'Add at least one item to the stock adjustment.' })
      .max(MAX_ADJUSTMENT_LINES, {
        error: `A stock adjustment can have at most ${MAX_ADJUSTMENT_LINES} lines.`,
      }),
  })
  .meta({ id: 'StockAdjustmentInput' });
export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;

// ---- Responses ---------------------------------------------------------------------------------

export const adjustmentItemSchema = z
  .object({
    lineNo: z.number().int(),
    productId: z.uuid(),
    variantId: z.uuid().nullable(),
    productName: z.string(),
    productCode: z.string(),
    designNo: z.string(),
    sizeName: z.string(),
    colorName: z.string(),
    sku: z.string(),
    barcode: z.string(),
    productType: z.enum(PRODUCT_TYPES).describe('Current product type (fabric allows decimals).'),
    systemQuantity: z.number().describe('In stock when the adjustment was saved.'),
    countedQuantity: z.number().nullable().describe('Count mode: the quantity counted.'),
    quantity: z.number().describe('Change to stock: + in, − out (0 = the count matched).'),
    unitCost: z.number().nullable(),
    value: z.number().describe('quantity × unit cost, signed (0 when the cost is not known).'),
    note: z.string(),
  })
  .meta({ id: 'StockAdjustmentItem' });
export type AdjustmentItem = z.infer<typeof adjustmentItemSchema>;

const adjustmentHeaderShape = {
  id: z.uuid(),
  adjNo: z.string().describe('e.g. ADJ-2026-00001 — runs without gaps per financial year.'),
  adjustmentDate: z.iso.date(),
  mode: z.enum(ADJUSTMENT_MODES),
  reason: z.enum(ADJUSTMENT_REASONS),
  notes: z.string(),
  itemCount: z.number().int(),
  quantityIn: z.number().describe('Sum of the increases.'),
  quantityOut: z.number().describe('Sum of the decreases (as a positive number).'),
  valueIn: z.number(),
  valueOut: z.number(),
  status: z.enum(ADJUSTMENT_STATUSES),
  createdByName: z.string(),
  createdAt: z.date(),
};

export const adjustmentSummarySchema = z
  .object(adjustmentHeaderShape)
  .meta({ id: 'StockAdjustmentSummary' });
export type AdjustmentSummary = z.infer<typeof adjustmentSummarySchema>;

export const adjustmentSchema = z
  .object({
    ...adjustmentHeaderShape,
    cancelledAt: z.date().nullable(),
    cancelledByName: z.string().nullable(),
    createdBy: z.uuid(),
    updatedAt: z.date(),
    items: z.array(adjustmentItemSchema),
  })
  .meta({ id: 'StockAdjustment' });
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const adjustmentListQuerySchema = z
  .object({
    search: z.string().trim().max(100).default('').describe('ADJ number, notes or who entered it.'),
    reason: z.enum(ADJUSTMENT_REASONS).optional(),
    status: z.enum(ADJUSTMENT_STATUSES).optional(),
    from: isoDate('From date').optional().describe('Adjustments dated on or after this date.'),
    to: isoDate('To date').optional().describe('Adjustments dated on or before this date.'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    error: 'To date cannot be before From date.',
  });
export type AdjustmentListQuery = z.infer<typeof adjustmentListQuerySchema>;

export const adjustmentNextNumberQuerySchema = z.object({
  date: isoDate('Date').optional().describe('Adjustment date (default today).'),
});
export type AdjustmentNextNumberQuery = z.infer<typeof adjustmentNextNumberQuerySchema>;

export const adjustmentNextNumberSchema = z
  .object({ adjNo: z.string().describe('The number the next saved adjustment would get.') })
  .meta({ id: 'NextStockAdjustmentNumber' });

/** Items to load onto an adjustment in one go (a category / brand to count, below-zero items). */
export const adjustmentItemsQuerySchema = z.object({
  categoryId: uuidField('Category').optional(),
  brandId: uuidField('Brand').optional(),
  stock: z
    .enum(['in', 'out', 'negative'])
    .optional()
    .describe('in = more than 0, out = 0 or less, negative = below 0.'),
  status: z
    .enum(['active', 'inactive', 'all'])
    .default('active')
    .describe('Product status (default active).'),
  limit: z.coerce.number().int().min(1).max(MAX_ADJUSTMENT_LINES).default(MAX_ADJUSTMENT_LINES),
});
export type AdjustmentItemsQuery = z.infer<typeof adjustmentItemsQuerySchema>;

export const adjustmentItemsSchema = z.array(purchasableItemSchema);

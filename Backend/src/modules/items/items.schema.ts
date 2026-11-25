import { z } from 'zod';

import { barcodeField, uuidField } from '../../common/validators/fields.js';
import { createListQuerySchema } from '../../common/validators/list-query.js';
import { sellableItemSchema } from '../sales/sales.schema.js';
import { BARCODE_PREFIX_PATTERN } from './shop-barcode.js';

// ---- Items list ---------------------------------------------------------------------------------

/** A row of the Items screen: a sellable item plus its category. */
export const catalogItemSchema = sellableItemSchema
  .extend({
    categoryId: z.uuid(),
    categoryName: z.string(),
  })
  .meta({ id: 'CatalogItem' });
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const BARCODE_FILTERS = ['missing', 'assigned'] as const;
/** in = more than 0; out = 0 or less; negative = below 0 (sold before being entered). */
export const STOCK_FILTERS = ['in', 'out', 'negative'] as const;

export const itemListQuerySchema = createListQuerySchema(
  ['name', 'sku', 'barcode', 'categoryName', 'brandName', 'mrp', 'unitPrice', 'stock', 'status'],
  {
    categoryId: uuidField('categoryId').optional().describe('Filter by category.'),
    brandId: uuidField('brandId').optional().describe('Filter by brand.'),
    sizeId: uuidField('sizeId').optional().describe('Only variants of this size.'),
    colorId: uuidField('colorId').optional().describe('Only variants of this colour.'),
    barcode: z
      .enum(BARCODE_FILTERS)
      .optional()
      .describe('missing = items without a barcode; assigned = items with one.'),
    stock: z
      .enum(STOCK_FILTERS)
      .optional()
      .describe('in = in stock (> 0); out = 0 or less; negative = below 0.'),
  },
);
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

export const itemCountsSchema = z
  .object({
    total: z.number().int().describe('All items (active and inactive).'),
    active: z.number().int(),
    missingBarcode: z.number().int().describe('Active items without a barcode.'),
    belowZero: z
      .number()
      .int()
      .describe('Items whose stock is below zero (sold before being entered).'),
  })
  .meta({ id: 'ItemCounts' });
export type ItemCounts = z.infer<typeof itemCountsSchema>;

// ---- Assigning barcodes -------------------------------------------------------------------------

export const MAX_BARCODE_ASSIGNMENTS = 500;

export const barcodeAssignmentInputSchema = z.object({
  productId: uuidField('Product'),
  variantId: uuidField('Variant')
    .nullish()
    .transform((value) => value ?? null)
    .describe('Null for products without variants.'),
  barcode: barcodeField.describe(
    "The barcode to give the item (e.g. the maker's barcode, scanned). Empty = generate the " +
      "shop's next barcode.",
  ),
  replace: z
    .boolean()
    .default(false)
    .describe(
      'The item already has a barcode and it should change. Without this, an item that already ' +
        'has a barcode is refused (so two people cannot overwrite each other).',
    ),
});
export type BarcodeAssignmentInput = z.infer<typeof barcodeAssignmentInputSchema>;

export const barcodeAssignmentsInputSchema = z
  .object({
    items: z
      .array(barcodeAssignmentInputSchema)
      .min(1, { error: 'Add at least one item.' })
      .max(MAX_BARCODE_ASSIGNMENTS, {
        error: `At most ${MAX_BARCODE_ASSIGNMENTS} items can be saved at once.`,
      }),
  })
  .meta({ id: 'BarcodeAssignmentsInput' });
export type BarcodeAssignmentsInput = z.infer<typeof barcodeAssignmentsInputSchema>;

export const barcodeAssignmentSchema = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid().nullable(),
    barcode: z.string().describe('The barcode the item has now.'),
    previousBarcode: z.string().describe("The barcode before this save ('' = none)."),
    generated: z.boolean().describe("True when the shop's next number was generated."),
  })
  .meta({ id: 'BarcodeAssignment' });
export type BarcodeAssignment = z.infer<typeof barcodeAssignmentSchema>;

// ---- Barcode & label settings -------------------------------------------------------------------

export const LABEL_LAYOUTS = ['roll-50x25', 'roll-38x25-2', 'a4-65'] as const;
export type LabelLayout = (typeof LABEL_LAYOUTS)[number];

const labelOptionsShape = {
  labelLayout: z
    .enum(LABEL_LAYOUTS, { error: `Label layout must be one of: ${LABEL_LAYOUTS.join(', ')}.` })
    .describe(
      'roll-50x25 = 50 x 25 mm roll; roll-38x25-2 = 38 x 25 mm roll, two across; ' +
        'a4-65 = A4 sheet of 65 labels (38.1 x 21.2 mm).',
    ),
  showShopName: z.boolean(),
  showProductName: z.boolean(),
  showDetails: z.boolean().describe('Design / size / colour line.'),
  showMrp: z.boolean(),
  showSellingPrice: z.boolean(),
};

export const barcodeSettingsSchema = z
  .object({
    prefix: z.string().describe('First 3 digits of shop barcodes (200–299).'),
    lastNumber: z.number().int().describe('Running number of the last generated barcode.'),
    nextBarcode: z.string().describe('The barcode the next generated item would get.'),
    ...labelOptionsShape,
  })
  .meta({ id: 'BarcodeSettings' });
export type BarcodeSettings = z.infer<typeof barcodeSettingsSchema>;

export const barcodeSettingsInputSchema = z
  .object({
    prefix: z.string({ error: 'Prefix is required.' }).trim().regex(BARCODE_PREFIX_PATTERN, {
      error: 'Prefix must be 3 digits from 200 to 299 (the in-store barcode range).',
    }),
    ...labelOptionsShape,
  })
  .meta({ id: 'BarcodeSettingsInput' });
export type BarcodeSettingsInput = z.infer<typeof barcodeSettingsInputSchema>;

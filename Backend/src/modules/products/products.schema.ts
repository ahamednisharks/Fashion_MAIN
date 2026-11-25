import { z } from 'zod';

import {
  barcodeField,
  codeField,
  hsnField,
  moneyField,
  optionalMoneyField,
  optionalText,
  requiredText,
  statusEnum,
  statusField,
  uuidField,
} from '../../common/validators/fields.js';
import {
  createExistsQuerySchema,
  createListQuerySchema,
} from '../../common/validators/list-query.js';
import { normalizeKey } from '../../common/utils/text.js';

export const PRODUCT_TYPES = ['readymade', 'fabric', 'accessory', 'footwear', 'other'] as const;
export const GST_RATES = [0, 5, 12, 18, 28, 40] as const;

// ---- Variant input (shared by the product payload and the variants sub-resource) -------------

export const variantFields = {
  designNo: optionalText('Design / model number', 30),
  sizeId: uuidField('Size'),
  colorId: uuidField('Colour'),
  sku: codeField('SKU', 60),
  barcode: barcodeField,
  purchasePrice: optionalMoneyField('Purchase price').describe('Override; null = product price.'),
  sellingPrice: optionalMoneyField('Selling price').describe('Override; null = product price.'),
  mrp: optionalMoneyField('MRP').describe('Override; null = product MRP.'),
};

/** Variant inside a product payload: include `id` to keep an existing variant, omit it to add one. */
export const productVariantInputSchema = z
  .object({
    id: uuidField('Variant ID')
      .nullish()
      .transform((value) => value ?? null)
      .describe('Existing variant ID; omit for a new variant.'),
    ...variantFields,
  })
  .meta({ id: 'ProductVariantInput' });
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

// ---- Product input ---------------------------------------------------------------------------

export const productInputSchema = z
  .object({
    name: requiredText('Product name', 120),
    code: codeField('Product code', 30).describe('Unique, uppercase. Also used as the SKU prefix.'),
    categoryId: uuidField('Category'),
    brandId: z
      .union([uuidField('Brand'), z.literal(''), z.null()])
      .optional()
      .transform((value) => value || null)
      .describe('Brand ID, or null / "" for unbranded products.'),
    description: optionalText('Description', 500),
    productType: z
      .enum(PRODUCT_TYPES, { error: `Product type must be one of: ${PRODUCT_TYPES.join(', ')}.` })
      .default('readymade'),
    hsnCode: hsnField,
    gstRate: z
      .literal(GST_RATES, { error: `GST rate must be one of ${GST_RATES.join(', ')}.` })
      .default(5),
    mrp: moneyField('MRP'),
    sellingPrice: moneyField('Selling price'),
    purchasePrice: optionalMoneyField('Purchase price'),
    barcode: barcodeField.describe('Used when the product is sold without variants.'),
    status: statusField,
    variants: z
      .array(productVariantInputSchema)
      .max(500, { error: 'A product can have at most 500 variants.' })
      .default([]),
  })
  .superRefine((product, ctx) => checkProductRules(product, ctx))
  .meta({ id: 'ProductInput' });
export type ProductInput = z.infer<typeof productInputSchema>;

/** Variant sub-resource payload (no id — it comes from the URL). */
export const variantInputSchema = z.object(variantFields).meta({ id: 'VariantInput' });
export type VariantInput = z.infer<typeof variantInputSchema>;

/**
 * Payload-level rules: selling price ≤ MRP (after variant overrides), and unique
 * design/size/colour, SKU and barcode within the product.
 */
function checkProductRules(product: ProductInputBeforeRules, ctx: z.RefinementCtx): void {
  if (product.sellingPrice > product.mrp) {
    ctx.addIssue({
      code: 'custom',
      path: ['sellingPrice'],
      message: 'Selling price cannot be more than MRP.',
    });
  }

  const ids = new Map<string, number>();
  const combos = new Map<string, number>();
  const skus = new Map<string, number>();
  const barcodes = new Map<string, number>();
  const productBarcode = normalizeKey(product.barcode);

  product.variants.forEach((variant, index) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: ['variants', index, field], message });
    const seen = (map: Map<string, number>, key: string, field: string, message: string) => {
      const first = map.get(key);
      if (first === undefined) map.set(key, index);
      else issue(field, `${message} variant ${first + 1}.`);
    };

    if (variant.id) seen(ids, variant.id, 'id', 'Same variant ID as');
    seen(
      combos,
      [normalizeKey(variant.designNo), variant.sizeId, variant.colorId].join('|'),
      'sizeId',
      'Same design, size and colour as',
    );
    seen(skus, normalizeKey(variant.sku), 'sku', 'Same SKU as');

    const barcode = normalizeKey(variant.barcode);
    if (barcode) {
      if (barcode === productBarcode)
        issue('barcode', 'Barcode is the same as the product barcode.');
      seen(barcodes, barcode, 'barcode', 'Same barcode as');
    }

    const mrp = variant.mrp ?? product.mrp;
    const selling = variant.sellingPrice ?? product.sellingPrice;
    if (selling > mrp)
      issue('sellingPrice', 'Selling price cannot be more than MRP for this variant.');
  });
}

interface ProductInputBeforeRules {
  mrp: number;
  sellingPrice: number;
  barcode: string;
  variants: ProductVariantInput[];
}

// ---- Responses ----------------------------------------------------------------------------------

export const variantSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid(),
    designNo: z.string(),
    sizeId: z.uuid(),
    sizeName: z.string(),
    colorId: z.uuid(),
    colorName: z.string(),
    colorHex: z.string(),
    sku: z.string(),
    barcode: z.string(),
    purchasePrice: z.number().nullable(),
    sellingPrice: z.number().nullable(),
    mrp: z.number().nullable(),
    position: z.number().int(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'ProductVariant' });
export type Variant = z.infer<typeof variantSchema>;

export const productSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    code: z.string(),
    categoryId: z.uuid(),
    categoryName: z.string(),
    brandId: z.uuid().nullable(),
    brandName: z.string().nullable(),
    description: z.string(),
    productType: z.enum(PRODUCT_TYPES),
    hsnCode: z.string(),
    gstRate: z.number(),
    mrp: z.number(),
    purchasePrice: z.number().nullable(),
    sellingPrice: z.number(),
    barcode: z.string(),
    status: statusEnum,
    variantCount: z.number().int(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'ProductSummary' });
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productSchema = productSummarySchema
  .extend({ variants: z.array(variantSchema) })
  .meta({ id: 'Product' });
export type Product = z.infer<typeof productSchema>;

// ---- Queries -------------------------------------------------------------------------------------

export const productListQuerySchema = createListQuerySchema(
  [
    'name',
    'code',
    'categoryName',
    'brandName',
    'variantCount',
    'sellingPrice',
    'mrp',
    'status',
    'createdAt',
    'updatedAt',
  ],
  {
    categoryId: uuidField('categoryId').optional().describe('Filter by category.'),
    brandId: uuidField('brandId').optional().describe('Filter by brand.'),
    productType: z.enum(PRODUCT_TYPES).optional().describe('Filter by product type.'),
  },
);
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productExistsQuerySchema = createExistsQuerySchema(['code', 'barcode', 'sku']);

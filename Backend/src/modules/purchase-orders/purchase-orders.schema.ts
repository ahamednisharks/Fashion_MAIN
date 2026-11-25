import { z } from 'zod';

import { moneyField, optionalText, uuidField } from '../../common/validators/fields.js';
import { MAX_PAGE_SIZE } from '../../common/validators/list-query.js';
import { PRODUCT_TYPES } from '../products/products.schema.js';
import {
  MAX_BILL_LINES,
  MAX_QUANTITY,
  QUANTITY_DECIMALS,
  SUPPLY_TYPES,
  sellableItemSchema,
} from '../sales/sales.schema.js';

/** open → partial / received (set by Purchase Entry) — or cancelled. */
export const PO_STATUSES = ['open', 'partial', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const MAX_PO_LINES = MAX_BILL_LINES;

const hasAtMostDecimals = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.abs(Math.round(value * factor) - value * factor) < 1e-6;
};

// ---- Items (scan / search) ---------------------------------------------------------------------

/** A sellable item plus the rate the shop buys it at (GST-exclusive; null when not set). */
export const purchasableItemSchema = sellableItemSchema
  .extend({
    purchasePrice: z
      .number()
      .nullable()
      .describe('Purchase rate (GST exclusive) after variant overrides; null when not set.'),
  })
  .meta({ id: 'PurchasableItem' });
export type PurchasableItem = z.infer<typeof purchasableItemSchema>;

// ---- Saving a PO -------------------------------------------------------------------------------

export const poItemInputSchema = z.object({
  productId: uuidField('Product'),
  variantId: uuidField('Variant')
    .nullish()
    .transform((value) => value ?? null)
    .describe('Null for products without variants.'),
  quantity: z
    .number({ error: 'Quantity must be a number.' })
    .positive({ error: 'Quantity must be more than 0.' })
    .max(MAX_QUANTITY, { error: `Quantity cannot be more than ${MAX_QUANTITY}.` })
    .refine((value) => hasAtMostDecimals(value, QUANTITY_DECIMALS), {
      error: `Quantity can have at most ${QUANTITY_DECIMALS} decimal places.`,
    }),
  rate: moneyField('Rate')
    .refine((value) => value > 0, { error: 'Enter the purchase rate.' })
    .describe('Purchase rate per unit, GST exclusive.'),
  discountPercent: z
    .number({ error: 'Discount must be a number.' })
    .min(0, { error: 'Discount cannot be negative.' })
    .max(100, { error: 'Discount cannot be more than 100%.' })
    .refine((value) => hasAtMostDecimals(value, 2), {
      error: 'Discount can have at most 2 decimal places.',
    })
    .default(0),
});
export type PoItemInput = z.infer<typeof poItemInputSchema>;

export const poInputSchema = z
  .object({
    supplierId: uuidField('Supplier'),
    poDate: z.iso.date({ error: 'PO date must be a valid date (YYYY-MM-DD).' }),
    expectedDate: z.iso
      .date({ error: 'Expected date must be a valid date (YYYY-MM-DD).' })
      .nullish()
      .transform((value) => value ?? null)
      .describe('When the goods are expected (optional).'),
    notes: optionalText('Notes', 500).describe('Terms / instructions printed on the PO.'),
    items: z
      .array(poItemInputSchema)
      .min(1, { error: 'Add at least one item to the purchase order.' })
      .max(MAX_PO_LINES, { error: `A purchase order can have at most ${MAX_PO_LINES} lines.` }),
  })
  .refine((po) => !po.expectedDate || po.expectedDate >= po.poDate, {
    path: ['expectedDate'],
    error: 'Expected date cannot be before the PO date.',
  })
  .meta({ id: 'PurchaseOrderInput' });
export type PoInput = z.infer<typeof poInputSchema>;

// ---- Responses ---------------------------------------------------------------------------------

export const poItemSchema = z
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
    hsnCode: z.string(),
    productType: z.enum(PRODUCT_TYPES).describe('Current product type (fabric allows decimals).'),
    gstRate: z.number(),
    quantity: z.number(),
    rate: z.number(),
    discountPercent: z.number(),
    grossAmount: z.number(),
    discountAmount: z.number(),
    taxableValue: z.number(),
    cgstAmount: z.number(),
    sgstAmount: z.number(),
    igstAmount: z.number(),
    lineTotal: z.number(),
    receivedQuantity: z.number().describe('Filled in by Purchase Entry.'),
  })
  .meta({ id: 'PurchaseOrderItem' });
export type PoItem = z.infer<typeof poItemSchema>;

const poHeaderShape = {
  id: z.uuid(),
  poNo: z.string().describe('e.g. PO-2026-00001 — runs without gaps per financial year.'),
  poDate: z.iso.date(),
  expectedDate: z.iso.date().nullable(),
  supplierId: z.uuid(),
  supplierName: z.string(),
  itemCount: z.number().int(),
  totalQuantity: z.number(),
  grandTotal: z.number(),
  status: z.enum(PO_STATUSES),
  createdByName: z.string(),
  createdAt: z.date(),
};

export const poSummarySchema = z.object(poHeaderShape).meta({ id: 'PurchaseOrderSummary' });
export type PoSummary = z.infer<typeof poSummarySchema>;

export const poSchema = z
  .object({
    ...poHeaderShape,
    supplierMobile: z.string(),
    supplierGstNumber: z.string(),
    supplierAddress: z.string(),
    supplierState: z.string(),
    supplyType: z.enum(SUPPLY_TYPES).describe('intra = CGST + SGST, inter = IGST.'),
    notes: z.string(),
    grossAmount: z.number(),
    discountTotal: z.number(),
    taxableTotal: z.number(),
    cgstTotal: z.number(),
    sgstTotal: z.number(),
    igstTotal: z.number(),
    roundOff: z.number(),
    cancelledAt: z.date().nullable(),
    createdBy: z.uuid(),
    updatedByName: z.string(),
    updatedAt: z.date(),
    items: z.array(poItemSchema),
  })
  .meta({ id: 'PurchaseOrder' });
export type Po = z.infer<typeof poSchema>;

export const poListQuerySchema = z
  .object({
    search: z.string().trim().max(100).default('').describe('PO number or supplier name.'),
    status: z.enum(PO_STATUSES).optional(),
    supplierId: uuidField('Supplier').optional(),
    from: z.iso
      .date({ error: 'From date must be a valid date (YYYY-MM-DD).' })
      .optional()
      .describe('POs dated on or after this date.'),
    to: z.iso
      .date({ error: 'To date must be a valid date (YYYY-MM-DD).' })
      .optional()
      .describe('POs dated on or before this date.'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    error: 'To date cannot be before From date.',
  });
export type PoListQuery = z.infer<typeof poListQuerySchema>;

export const nextNumberQuerySchema = z.object({
  date: z.iso
    .date({ error: 'Date must be a valid date (YYYY-MM-DD).' })
    .optional()
    .describe('PO date (default today).'),
});
export type NextNumberQuery = z.infer<typeof nextNumberQuerySchema>;

export const nextNumberSchema = z
  .object({ poNo: z.string().describe('The number the next saved PO would get.') })
  .meta({ id: 'NextPurchaseOrderNumber' });

// ---- Receiving (Purchase Entry) ----------------------------------------------------------------

/** A PO line as an item to receive: the item as it is now plus ordered / received so far. */
export const receivableLineSchema = purchasableItemSchema
  .extend({
    lineNo: z.number().int(),
    orderedQuantity: z.number(),
    receivedQuantity: z.number().describe('Received so far by saved purchase entries.'),
    rate: z.number().describe('Rate on the PO (GST exclusive).'),
    discountPercent: z.number(),
  })
  .meta({ id: 'ReceivablePurchaseOrderLine' });

export const receivableOrderSchema = z
  .object({
    id: z.uuid(),
    poNo: z.string(),
    poDate: z.iso.date(),
    status: z.enum(PO_STATUSES),
    supplierId: z.uuid(),
    supplierName: z.string(),
    supplierMobile: z.string(),
    supplierGstNumber: z.string(),
    supplierAddress: z.string(),
    supplierState: z.string(),
    items: z.array(receivableLineSchema),
  })
  .meta({ id: 'ReceivablePurchaseOrder' });
export type ReceivableOrder = z.infer<typeof receivableOrderSchema>;

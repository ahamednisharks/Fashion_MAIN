import { z } from 'zod';

import { moneyField, optionalText, statusEnum, uuidField } from '../../common/validators/fields.js';
import { MAX_PAGE_SIZE } from '../../common/validators/list-query.js';
import { PRODUCT_TYPES } from '../products/products.schema.js';
import { shopProfileSchema } from '../settings/shop-settings.schema.js';

export const PAYMENT_MODES = ['cash', 'upi', 'card'] as const;
export const SUPPLY_TYPES = ['intra', 'inter'] as const;
export const INVOICE_STATUSES = ['completed', 'cancelled'] as const;

/** Most decimals allowed in a quantity (fabric sold by the metre, e.g. 2.125). */
export const QUANTITY_DECIMALS = 3;
export const MAX_QUANTITY = 9999;
export const MAX_BILL_LINES = 200;

const hasAtMostDecimals = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.abs(Math.round(value * factor) - value * factor) < 1e-6;
};

// ---- Sellable items (scan / search) -----------------------------------------------------------

/**
 * One thing that can go on a bill: a product variant, or a product that has no variants
 * (then `variantId` is null and `sku` is the product code).
 */
export const sellableItemSchema = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid().nullable(),
    productName: z.string(),
    productCode: z.string(),
    productType: z.enum(PRODUCT_TYPES),
    brandName: z.string(),
    designNo: z.string(),
    sizeName: z.string(),
    colorName: z.string(),
    colorHex: z.string(),
    sku: z.string(),
    barcode: z.string(),
    hsnCode: z.string(),
    gstRate: z.number(),
    mrp: z.number(),
    unitPrice: z.number().describe('Selling price (GST inclusive) after variant overrides.'),
    status: statusEnum.describe('Product status — inactive items cannot be billed.'),
    stock: z
      .number()
      .describe('Quantity in hand (may be below zero when goods were sold before being entered).'),
  })
  .meta({ id: 'SellableItem' });
export type SellableItem = z.infer<typeof sellableItemSchema>;

export const itemLookupQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe('Scanned / typed barcode, SKU or product code (exact, case-insensitive).'),
});
export type ItemLookupQuery = z.infer<typeof itemLookupQuerySchema>;

export const itemSearchQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('Words to find in name, code, SKU, barcode, design, brand, size or colour.'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ItemSearchQuery = z.infer<typeof itemSearchQuerySchema>;

// ---- Saving a bill ----------------------------------------------------------------------------

export const invoiceItemInputSchema = z.object({
  productId: uuidField('Product'),
  variantId: uuidField('Variant')
    .nullish()
    .transform((value) => value ?? null)
    .describe('Null for products sold without variants.'),
  quantity: z
    .number({ error: 'Quantity must be a number.' })
    .positive({ error: 'Quantity must be more than 0.' })
    .max(MAX_QUANTITY, { error: `Quantity cannot be more than ${MAX_QUANTITY}.` })
    .refine((value) => hasAtMostDecimals(value, QUANTITY_DECIMALS), {
      error: `Quantity can have at most ${QUANTITY_DECIMALS} decimal places.`,
    }),
  discountPercent: z
    .number({ error: 'Discount must be a number.' })
    .min(0, { error: 'Discount cannot be negative.' })
    .max(100, { error: 'Discount cannot be more than 100%.' })
    .refine((value) => hasAtMostDecimals(value, 2), {
      error: 'Discount can have at most 2 decimal places.',
    })
    .default(0),
  unitPrice: moneyField('Rate').describe(
    'The rate shown on screen. The save is refused if the current price is different.',
  ),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const paymentInputSchema = z.object({
  mode: z.enum(PAYMENT_MODES, { error: 'Payment mode must be cash, upi or card.' }),
  amount: moneyField('Amount').refine((value) => value > 0, {
    error: 'Amount must be more than 0.',
  }),
  reference: optionalText('Reference', 60).describe('UPI transaction ID or card last digits.'),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const invoiceInputSchema = z
  .object({
    customerId: uuidField('Customer')
      .nullish()
      .transform((value) => value ?? null)
      .describe('Null for a walk-in customer.'),
    items: z
      .array(invoiceItemInputSchema)
      .min(1, { error: 'Add at least one item to the bill.' })
      .max(MAX_BILL_LINES, { error: `A bill can have at most ${MAX_BILL_LINES} lines.` }),
    payments: z
      .array(paymentInputSchema)
      .max(6, { error: 'A bill can have at most 6 payments.' })
      .default([]),
  })
  .meta({ id: 'SalesInvoiceInput' });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

// ---- Responses ----------------------------------------------------------------------------------

export const invoiceItemSchema = z
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
    gstRate: z.number(),
    mrp: z.number(),
    unitPrice: z.number(),
    quantity: z.number(),
    discountPercent: z.number(),
    grossAmount: z.number(),
    discountAmount: z.number(),
    taxableValue: z.number(),
    cgstAmount: z.number(),
    sgstAmount: z.number(),
    igstAmount: z.number(),
    lineTotal: z.number(),
  })
  .meta({ id: 'SalesInvoiceItem' });
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoicePaymentSchema = z
  .object({ mode: z.enum(PAYMENT_MODES), amount: z.number(), reference: z.string() })
  .meta({ id: 'SalesInvoicePayment' });
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;

const invoiceHeaderShape = {
  id: z.uuid(),
  invoiceNo: z.string().describe('e.g. INV/26-27/00001 — runs without gaps per financial year.'),
  invoiceDate: z.iso.date().describe('Shop-local (IST) date.'),
  customerId: z.uuid().nullable(),
  customerName: z.string(),
  customerMobile: z.string(),
  itemCount: z.number().int(),
  totalQuantity: z.number(),
  grandTotal: z.number(),
  status: z.enum(INVOICE_STATUSES),
  createdByName: z.string(),
  createdAt: z.date(),
};

export const invoiceSummarySchema = z
  .object({ ...invoiceHeaderShape, paymentModes: z.array(z.enum(PAYMENT_MODES)) })
  .meta({ id: 'SalesInvoiceSummary' });
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const invoiceSchema = z
  .object({
    ...invoiceHeaderShape,
    seller: shopProfileSchema,
    customerGstNumber: z.string(),
    customerState: z.string(),
    supplyType: z.enum(SUPPLY_TYPES).describe('intra = CGST + SGST, inter = IGST.'),
    grossAmount: z.number(),
    discountTotal: z.number(),
    taxableTotal: z.number(),
    cgstTotal: z.number(),
    sgstTotal: z.number(),
    igstTotal: z.number(),
    roundOff: z.number(),
    amountReceived: z.number(),
    changeReturned: z.number(),
    createdBy: z.uuid(),
    updatedAt: z.date(),
    items: z.array(invoiceItemSchema),
    payments: z.array(invoicePaymentSchema),
  })
  .meta({ id: 'SalesInvoice' });
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceListQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100)
      .default('')
      .describe('Bill number, customer name or mobile.'),
    date: z.iso.date().optional().describe('Only bills of this date (YYYY-MM-DD).'),
    from: z.iso
      .date({ error: 'From date must be a valid date (YYYY-MM-DD).' })
      .optional()
      .describe('Only bills on or after this date.'),
    to: z.iso
      .date({ error: 'To date must be a valid date (YYYY-MM-DD).' })
      .optional()
      .describe('Only bills on or before this date.'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    error: 'To date cannot be before From date.',
  });
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

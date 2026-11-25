import { z } from 'zod';

import {
  optionalMoneyField,
  optionalText,
  requiredText,
  uuidField,
} from '../../common/validators/fields.js';
import { MAX_PAGE_SIZE } from '../../common/validators/list-query.js';
import { PRODUCT_TYPES } from '../products/products.schema.js';
import { MAX_PO_LINES, poItemInputSchema } from '../purchase-orders/purchase-orders.schema.js';
import { SUPPLY_TYPES, sellableItemSchema } from '../sales/sales.schema.js';

/** posted = saved (counts as received); cancelled entries are kept but count for nothing. */
export const PE_STATUSES = ['posted', 'cancelled'] as const;
export type PeStatus = (typeof PE_STATUSES)[number];

export const MAX_PE_LINES = MAX_PO_LINES;

const isoDate = (label: string) =>
  z.iso.date({ error: `${label} must be a valid date (YYYY-MM-DD).` });

// ---- Saving a PE -------------------------------------------------------------------------------

export const peItemInputSchema = poItemInputSchema.extend({
  mrp: optionalMoneyField('MRP').describe(
    'MRP to set on the item (GST inclusive); null keeps the current MRP.',
  ),
  sellingPrice: optionalMoneyField('Selling price').describe(
    'Selling price to set on the item (GST inclusive, at most the MRP); null keeps the current one.',
  ),
});
export type PeItemInput = z.infer<typeof peItemInputSchema>;

export const peInputSchema = z
  .object({
    supplierId: uuidField('Supplier'),
    purchaseOrderId: uuidField('Purchase order')
      .nullish()
      .transform((value) => value ?? null)
      .describe('The PO the goods are received against (same supplier); null = direct purchase.'),
    supplierInvoiceNo: requiredText('Supplier invoice number', 30),
    supplierInvoiceDate: isoDate('Supplier invoice date'),
    entryDate: isoDate('Received date').describe('The day the goods were received.'),
    billAmount: optionalMoneyField('Supplier bill amount').describe(
      'Total printed on the supplier invoice (optional, shown against the computed total).',
    ),
    notes: optionalText('Notes', 500),
    items: z
      .array(peItemInputSchema)
      .min(1, { error: 'Add at least one item to the purchase entry.' })
      .max(MAX_PE_LINES, { error: `A purchase entry can have at most ${MAX_PE_LINES} lines.` }),
  })
  .refine((entry) => entry.supplierInvoiceDate <= entry.entryDate, {
    path: ['supplierInvoiceDate'],
    error: 'The supplier invoice date cannot be after the received date.',
  })
  .meta({ id: 'PurchaseEntryInput' });
export type PeInput = z.infer<typeof peInputSchema>;

// ---- Responses ---------------------------------------------------------------------------------

export const peItemSchema = z
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
    mrp: z.number().describe('MRP set when the goods came in.'),
    sellingPrice: z.number().describe('Selling price set when the goods came in.'),
    orderedQuantity: z
      .number()
      .nullable()
      .describe('Quantity of this item on the linked PO (null = not on the PO, or no PO).'),
  })
  .meta({ id: 'PurchaseEntryItem' });
export type PeItem = z.infer<typeof peItemSchema>;

const peHeaderShape = {
  id: z.uuid(),
  peNo: z.string().describe('e.g. PE-2026-00001 — runs without gaps per financial year.'),
  entryDate: z.iso.date().describe('Received on.'),
  supplierId: z.uuid(),
  supplierName: z.string(),
  supplierInvoiceNo: z.string(),
  supplierInvoiceDate: z.iso.date(),
  purchaseOrderId: z.uuid().nullable(),
  poNo: z.string().nullable(),
  itemCount: z.number().int(),
  totalQuantity: z.number(),
  grandTotal: z.number(),
  status: z.enum(PE_STATUSES),
  createdByName: z.string(),
  createdAt: z.date(),
};

export const peSummarySchema = z.object(peHeaderShape).meta({ id: 'PurchaseEntrySummary' });
export type PeSummary = z.infer<typeof peSummarySchema>;

export const peSchema = z
  .object({
    ...peHeaderShape,
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
    billAmount: z.number().nullable(),
    cancelledAt: z.date().nullable(),
    createdBy: z.uuid(),
    updatedByName: z.string(),
    updatedAt: z.date(),
    items: z.array(peItemSchema),
  })
  .meta({ id: 'PurchaseEntry' });
export type Pe = z.infer<typeof peSchema>;

/** An item of an entry as it is now, with how many labels to print (the received quantity). */
export const peLabelItemSchema = sellableItemSchema
  .extend({
    copies: z.number().int().describe('Received quantity (1 for fabric, which comes in metres).'),
  })
  .meta({ id: 'PurchaseEntryLabelItem' });
export type PeLabelItem = z.infer<typeof peLabelItemSchema>;

export const peListQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100)
      .default('')
      .describe('PE number, supplier, supplier invoice number or PO number.'),
    status: z.enum(PE_STATUSES).optional(),
    supplierId: uuidField('Supplier').optional(),
    purchaseOrderId: uuidField('Purchase order').optional(),
    from: isoDate('From date').optional().describe('Entries received on or after this date.'),
    to: isoDate('To date').optional().describe('Entries received on or before this date.'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    error: 'To date cannot be before From date.',
  });
export type PeListQuery = z.infer<typeof peListQuerySchema>;

export const peNextNumberQuerySchema = z.object({
  date: isoDate('Date').optional().describe('Received date (default today).'),
});
export type PeNextNumberQuery = z.infer<typeof peNextNumberQuerySchema>;

export const peNextNumberSchema = z
  .object({ peNo: z.string().describe('The number the next saved entry would get.') })
  .meta({ id: 'NextPurchaseEntryNumber' });

export const receivableOrdersQuerySchema = z.object({
  supplierId: uuidField('Supplier').optional().describe('Only this supplier (default: all).'),
});

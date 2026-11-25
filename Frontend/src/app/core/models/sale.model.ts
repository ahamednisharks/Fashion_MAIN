import { ProductType } from './product.model';
import { ShopProfile } from './shop-profile.model';

export type PaymentMode = 'cash' | 'upi' | 'card';
/** 'intra' = CGST + SGST, 'inter' = IGST. */
export type SupplyType = 'intra' | 'inter';
export type InvoiceStatus = 'completed' | 'cancelled';

export const PAYMENT_MODE_LABELS: Readonly<Record<PaymentMode, string>> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
};

/**
 * Something that can go on a bill: a product variant, or a product without variants
 * (`variantId` null, `sku` = product code). Prices are GST-inclusive.
 */
export interface SellableItem {
  productId: string;
  variantId: string | null;
  productName: string;
  productCode: string;
  productType: ProductType;
  brandName: string;
  designNo: string;
  sizeName: string;
  colorName: string;
  colorHex: string;
  sku: string;
  barcode: string;
  hsnCode: string;
  gstRate: number;
  mrp: number;
  unitPrice: number;
  /** Inactive items are returned by the scanner lookup but cannot be billed. */
  status: 'active' | 'inactive';
  /**
   * Quantity in hand (may be below zero: sold before being entered). Absent when not known,
   * e.g. for lines loaded from a saved document.
   */
  stock?: number;
}

/** "K-21 · M · Mustard" (empty for products without variants). */
export function itemDetails(item: {
  designNo: string;
  sizeName: string;
  colorName: string;
}): string {
  return [item.designNo, item.sizeName, item.colorName].filter(Boolean).join(' · ');
}

export interface SaleInvoiceItemInput {
  productId: string;
  variantId: string | null;
  quantity: number;
  discountPercent: number;
  /** The rate shown on screen — the server refuses the bill if the price has changed. */
  unitPrice: number;
}

export interface SalePaymentInput {
  mode: PaymentMode;
  amount: number;
  reference: string;
}

export interface SaleInvoiceInput {
  /** null = walk-in customer. */
  customerId: string | null;
  items: SaleInvoiceItemInput[];
  payments: SalePaymentInput[];
}

export interface SaleInvoiceItem {
  lineNo: number;
  productId: string;
  variantId: string | null;
  productName: string;
  productCode: string;
  designNo: string;
  sizeName: string;
  colorName: string;
  sku: string;
  barcode: string;
  hsnCode: string;
  gstRate: number;
  mrp: number;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  grossAmount: number;
  discountAmount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

/** Row of the bills list. */
export interface SaleInvoiceSummary {
  id: string;
  invoiceNo: string;
  /** YYYY-MM-DD (shop-local date). */
  invoiceDate: string;
  customerId: string | null;
  customerName: string;
  customerMobile: string;
  itemCount: number;
  totalQuantity: number;
  grandTotal: number;
  status: InvoiceStatus;
  createdByName: string;
  createdAt: string;
  paymentModes: PaymentMode[];
}

/** A saved bill, as printed. */
export interface SaleInvoice extends Omit<SaleInvoiceSummary, 'paymentModes'> {
  seller: ShopProfile;
  customerGstNumber: string;
  customerState: string;
  supplyType: SupplyType;
  grossAmount: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  amountReceived: number;
  changeReturned: number;
  createdBy: string;
  updatedAt: string;
  items: SaleInvoiceItem[];
  payments: SalePaymentInput[];
}

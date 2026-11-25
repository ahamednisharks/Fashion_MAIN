import { ProductType } from './product.model';
import { SellableItem, SupplyType } from './sale.model';

/** open → partial / received (set by Purchase Entry) — or cancelled. */
export type PoStatus = 'open' | 'partial' | 'received' | 'cancelled';

export const PO_STATUS_LABELS: Readonly<Record<PoStatus, string>> = {
  open: 'Open',
  partial: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** A sellable item with the rate the shop buys it at (GST exclusive; null when not set). */
export interface PurchasableItem extends SellableItem {
  purchasePrice: number | null;
}

export interface PoItemInput {
  productId: string;
  variantId: string | null;
  quantity: number;
  /** GST-exclusive purchase rate per unit. */
  rate: number;
  discountPercent: number;
}

export interface PoInput {
  supplierId: string;
  /** YYYY-MM-DD */
  poDate: string;
  /** YYYY-MM-DD or null. */
  expectedDate: string | null;
  notes: string;
  items: PoItemInput[];
}

export interface PoItem {
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
  /** Current product type — fabric may be ordered in metres (decimals). */
  productType: ProductType;
  gstRate: number;
  quantity: number;
  rate: number;
  discountPercent: number;
  grossAmount: number;
  discountAmount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
  /** Filled in by Purchase Entry. */
  receivedQuantity: number;
}

/** Row of the PO list. */
export interface PoSummary {
  id: string;
  /** e.g. PO-2026-00001 */
  poNo: string;
  poDate: string;
  expectedDate: string | null;
  supplierId: string;
  supplierName: string;
  itemCount: number;
  totalQuantity: number;
  grandTotal: number;
  status: PoStatus;
  createdByName: string;
  createdAt: string;
}

export interface PurchaseOrder extends PoSummary {
  supplierMobile: string;
  supplierGstNumber: string;
  supplierAddress: string;
  supplierState: string;
  supplyType: SupplyType;
  notes: string;
  grossAmount: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  cancelledAt: string | null;
  createdBy: string;
  updatedByName: string;
  updatedAt: string;
  items: PoItem[];
}

/** Open POs with nothing received can still be edited / cancelled. */
export function isPoEditable(po: Pick<PurchaseOrder, 'status' | 'items'>): boolean {
  return po.status === 'open' && po.items.every((item) => item.receivedQuantity === 0);
}

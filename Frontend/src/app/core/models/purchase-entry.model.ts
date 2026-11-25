import { ProductType } from './product.model';
import { PoItemInput, PoStatus, PurchasableItem } from './purchase-order.model';
import { SellableItem, SupplyType } from './sale.model';

/** posted = saved (counts as received); cancelled entries are kept but count for nothing. */
export type PeStatus = 'posted' | 'cancelled';

export const PE_STATUS_LABELS: Readonly<Record<PeStatus, string>> = {
  posted: 'Received',
  cancelled: 'Cancelled',
};

export interface PeItemInput extends PoItemInput {
  /** MRP to set on the item (GST inclusive); null keeps the current MRP. */
  mrp: number | null;
  /** Selling price to set on the item (GST inclusive, at most the MRP); null keeps it. */
  sellingPrice: number | null;
}

export interface PeInput {
  supplierId: string;
  /** The PO received against; null = direct purchase. */
  purchaseOrderId: string | null;
  supplierInvoiceNo: string;
  /** YYYY-MM-DD */
  supplierInvoiceDate: string;
  /** Received on, YYYY-MM-DD. */
  entryDate: string;
  /** Total printed on the supplier's invoice (optional). */
  billAmount: number | null;
  notes: string;
  items: PeItemInput[];
}

export interface PeItem {
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
  /** Current product type — fabric may be received in metres (decimals). */
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
  /** MRP set when the goods came in. */
  mrp: number;
  /** Selling price set when the goods came in. */
  sellingPrice: number;
  /** Quantity of this item on the linked PO (null = not on the PO, or no PO). */
  orderedQuantity: number | null;
}

/** Row of the purchase entry list. */
export interface PeSummary {
  id: string;
  /** e.g. PE-2026-00001 */
  peNo: string;
  /** Received on. */
  entryDate: string;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  purchaseOrderId: string | null;
  poNo: string | null;
  itemCount: number;
  totalQuantity: number;
  grandTotal: number;
  status: PeStatus;
  createdByName: string;
  createdAt: string;
}

export interface PurchaseEntry extends PeSummary {
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
  billAmount: number | null;
  cancelledAt: string | null;
  createdBy: string;
  updatedByName: string;
  updatedAt: string;
  items: PeItem[];
}

/** A PO line as an item to receive: the item as it is now plus ordered / received so far. */
export interface ReceivableLine extends PurchasableItem {
  lineNo: number;
  orderedQuantity: number;
  /** Received so far by saved entries. */
  receivedQuantity: number;
  /** Rate on the PO (GST exclusive). */
  rate: number;
  discountPercent: number;
}

/** A purchase order as items to receive. */
export interface ReceivableOrder {
  id: string;
  poNo: string;
  poDate: string;
  status: PoStatus;
  supplierId: string;
  supplierName: string;
  supplierMobile: string;
  supplierGstNumber: string;
  supplierAddress: string;
  supplierState: string;
  items: ReceivableLine[];
}

/** An item of an entry as it is now, with the received quantity as label copies. */
export interface PeLabelItem extends SellableItem {
  copies: number;
}

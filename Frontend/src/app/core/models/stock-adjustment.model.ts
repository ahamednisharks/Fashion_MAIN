import { ProductType } from './product.model';

/**
 * count = the quantity counted is entered (stock changes by counted − in stock);
 * change = the quantity to add (+) or take out (−) is entered.
 */
export type AdjustmentMode = 'count' | 'change';

export type AdjustmentReason =
  'opening_stock' | 'stock_count' | 'damaged' | 'lost' | 'found' | 'other';

/** posted = counts in stock; cancelled adjustments are kept but change nothing. */
export type AdjustmentStatus = 'posted' | 'cancelled';

export const ADJUSTMENT_REASON_LABELS: Readonly<Record<AdjustmentReason, string>> = {
  opening_stock: 'Opening stock',
  stock_count: 'Stock count',
  damaged: 'Damaged',
  lost: 'Lost / stolen',
  found: 'Found',
  other: 'Other',
};

export const ADJUSTMENT_REASONS = Object.keys(ADJUSTMENT_REASON_LABELS) as AdjustmentReason[];

/** The way of entering quantities that suits each reason (chosen when the reason is picked). */
export const ADJUSTMENT_REASON_MODES: Readonly<Record<AdjustmentReason, AdjustmentMode>> = {
  opening_stock: 'count',
  stock_count: 'count',
  damaged: 'change',
  lost: 'change',
  found: 'change',
  other: 'change',
};

/** Damaged and lost goods only leave stock; found goods only come in (the server checks too). */
export const ADJUSTMENT_DIRECTION: Readonly<Partial<Record<AdjustmentReason, 'in' | 'out'>>> = {
  damaged: 'out',
  lost: 'out',
  found: 'in',
};

export const ADJUSTMENT_MODE_LABELS: Readonly<Record<AdjustmentMode, string>> = {
  count: 'Count',
  change: 'Add / remove',
};

export const ADJUSTMENT_STATUS_LABELS: Readonly<Record<AdjustmentStatus, string>> = {
  posted: 'Posted',
  cancelled: 'Cancelled',
};

export interface AdjustmentItemInput {
  productId: string;
  variantId: string | null;
  /** Count mode: the quantity counted. */
  countedQuantity: number | null;
  /** Change mode: + in, − out. */
  quantity: number | null;
  /** Count mode: the stock the screen showed (the server refuses the save if it has moved). */
  systemQuantity: number | null;
  /** Cost of one piece, GST exclusive; null = not known. */
  unitCost: number | null;
  note: string;
}

export interface AdjustmentInput {
  /** YYYY-MM-DD */
  adjustmentDate: string;
  mode: AdjustmentMode;
  reason: AdjustmentReason;
  notes: string;
  items: AdjustmentItemInput[];
}

export interface AdjustmentItem {
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
  productType: ProductType;
  /** In stock when the adjustment was saved. */
  systemQuantity: number;
  /** Count mode: the quantity counted (null in change mode). */
  countedQuantity: number | null;
  /** Change to stock: + in, − out (0 = the count matched). */
  quantity: number;
  unitCost: number | null;
  /** quantity × unit cost, signed (0 when the cost is not known). */
  value: number;
  note: string;
}

export interface AdjustmentSummary {
  id: string;
  /** e.g. ADJ-2026-00001 */
  adjNo: string;
  /** YYYY-MM-DD */
  adjustmentDate: string;
  mode: AdjustmentMode;
  reason: AdjustmentReason;
  notes: string;
  itemCount: number;
  quantityIn: number;
  quantityOut: number;
  valueIn: number;
  valueOut: number;
  status: AdjustmentStatus;
  createdByName: string;
  createdAt: string;
}

export interface StockAdjustment extends AdjustmentSummary {
  cancelledAt: string | null;
  cancelledByName: string | null;
  createdBy: string;
  updatedAt: string;
  items: AdjustmentItem[];
}

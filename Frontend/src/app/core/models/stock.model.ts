/** What moved the stock: purchase entries add, bills take away, stock adjustments either way. */
export type StockMovementKind = 'purchase' | 'sale' | 'adjustment';
export type StockSourceType = 'purchase_entry' | 'sales_invoice' | 'stock_adjustment';

export const STOCK_KIND_LABELS: Readonly<Record<StockMovementKind, string>> = {
  purchase: 'Purchase',
  sale: 'Sale',
  adjustment: 'Adjustment',
};

export interface StockMovement {
  /** Date of the document (YYYY-MM-DD). */
  date: string;
  kind: StockMovementKind;
  sourceType: StockSourceType;
  sourceId: string;
  /** e.g. PE-2026-00001 or INV/26-27/00012 */
  sourceNo: string;
  /** + in, − out. */
  quantity: number;
  /** Quantity in hand after this movement. */
  balance: number;
  createdAt: string;
}

export interface StockHistory {
  productId: string;
  variantId: string | null;
  /** Quantity in hand now. */
  stock: number;
  totalMovements: number;
  /** Newest first. */
  movements: StockMovement[];
}

/** An item's quantity in hand now. */
export interface StockLevel {
  productId: string;
  variantId: string | null;
  stock: number;
}

/** in = more than 0; out = 0 or less; negative = below 0 (sold before being entered). */
export type StockFilter = 'in' | 'out' | 'negative';

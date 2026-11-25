import { PagedResult, SortState } from '../data-access/api.types';
import { EntityStatus } from './base.model';
import { SellableItem } from './sale.model';

/** Sums over completed bills of a period (cancelled bills are left out). Amounts in rupees. */
export interface SalesTotals {
  billCount: number;
  /** Pieces / metres sold. */
  quantity: number;
  /** Value at the selling rate, before discount. */
  grossAmount: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  /** CGST + SGST + IGST. */
  gstTotal: number;
  roundOff: number;
  /** Sum of bill totals — what customers paid. */
  netSales: number;
  averageBill: number;
  /** Cash received minus change returned. */
  cash: number;
  upi: number;
  card: number;
}

export interface SalesDay extends SalesTotals {
  /** YYYY-MM-DD (shop-local date). */
  date: string;
}

export interface SalesReport {
  /** YYYY-MM-DD, included. */
  from: string;
  /** YYYY-MM-DD, included. */
  to: string;
  totals: SalesTotals;
  /** Days that had sales, oldest first. */
  days: SalesDay[];
}

// ---- Stock report --------------------------------------------------------------------------------

/**
 * Which items the stock report lists, by the stock at the end of the period:
 * any = items that had stock or a movement in the period; in = above 0; out = 0 or less;
 * negative = below 0; all = every item, also those that never had stock.
 */
export type StockReportFilter = 'any' | 'in' | 'out' | 'negative' | 'all';

export const STOCK_REPORT_FILTERS: readonly { value: StockReportFilter; label: string }[] = [
  { value: 'any', label: 'Stock or movement' },
  { value: 'in', label: 'In stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'negative', label: 'Below zero' },
  { value: 'all', label: 'All items' },
];

export interface StockReportQuery {
  /** YYYY-MM-DD, included. */
  from: string;
  /** YYYY-MM-DD, included. */
  to: string;
  search?: string;
  status?: EntityStatus | '';
  brandId?: string;
  sizeId?: string;
  colorId?: string;
  stock?: StockReportFilter;
  page?: number;
  pageSize?: number;
  sort?: SortState | null;
}

/** Quantities of a period (pieces / metres) and the closing stock's value. */
export interface StockFigures {
  /** Stock at the start of the first day. */
  opening: number;
  /** Received with purchase entries in the period. */
  purchased: number;
  /** Sold on bills in the period (a positive number). */
  sold: number;
  /** Net stock adjustments in the period (+ in, − out). */
  adjusted: number;
  /** Stock at the end of the last day = opening + purchased − sold + adjusted. */
  closing: number;
  /** Closing stock (when above zero) × purchase rate, GST exclusive. */
  stockValue: number;
}

export interface StockReportRow extends SellableItem, StockFigures {
  categoryName: string;
  /** The item's purchase rate now (null = not set). */
  purchaseRate: number | null;
}

export interface StockReportTotals extends StockFigures {
  /** Items matching the filters (all pages). */
  itemCount: number;
}

export interface StockReport extends PagedResult<StockReportRow> {
  from: string;
  to: string;
  /** Sums over every matching item, not only this page. */
  totals: StockReportTotals;
  totalPages: number;
}

/** The whole report for an Excel / PDF file. */
export interface StockReportExport {
  from: string;
  to: string;
  totals: StockReportTotals;
  items: StockReportRow[];
  /** More items matched than one file may hold. */
  truncated: boolean;
}

import { SellableItem } from './sale.model';

/**
 * A row of the Items screen: one product variant, or one product without variants
 * (`variantId` null, `sku` = product code). Same shape as the billing scan results plus the category.
 */
export interface CatalogItem extends SellableItem {
  categoryId: string;
  categoryName: string;
}

/** productId|variantId — identifies an item across screens. */
export function itemKey(item: Pick<SellableItem, 'productId' | 'variantId'>): string {
  return `${item.productId}|${item.variantId ?? ''}`;
}

export type BarcodeFilter = 'missing' | 'assigned';

export interface ItemCounts {
  total: number;
  active: number;
  /** Active items without a barcode. */
  missingBarcode: number;
  /** Items whose stock is below zero (sold before being entered). */
  belowZero: number;
}

export interface BarcodeAssignmentInput {
  productId: string;
  variantId: string | null;
  /** '' = generate the shop's next barcode. */
  barcode: string;
  /** Required to change a barcode the item already has. */
  replace: boolean;
}

export interface BarcodeAssignment {
  productId: string;
  variantId: string | null;
  barcode: string;
  previousBarcode: string;
  generated: boolean;
}

export type LabelLayoutId = 'roll-50x25' | 'roll-38x25-2' | 'a4-65';

/** What is printed on a price label (the barcode is always printed). */
export interface LabelOptions {
  labelLayout: LabelLayoutId;
  showShopName: boolean;
  showProductName: boolean;
  /** Design / size / colour line. */
  showDetails: boolean;
  showMrp: boolean;
  showSellingPrice: boolean;
}

export interface BarcodeSettings extends LabelOptions {
  /** First 3 digits of the shop's own barcodes (200–299). */
  prefix: string;
  lastNumber: number;
  /** The barcode the next generated item would get. */
  nextBarcode: string;
}

export type BarcodeSettingsInput = LabelOptions & { prefix: string };

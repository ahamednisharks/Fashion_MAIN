import { BaseEntity, EntityInput } from './base.model';

export type ProductType = 'readymade' | 'fabric' | 'accessory' | 'footwear' | 'other';

export const PRODUCT_TYPE_OPTIONS: readonly { value: ProductType; label: string }[] = [
  { value: 'readymade', label: 'Readymade garment' },
  { value: 'fabric', label: 'Fabric / Unstitched' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'other', label: 'Other' },
];

export function productTypeLabel(type: ProductType): string {
  return PRODUCT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

/** GST rate slabs offered in the product form (percent). */
export const GST_RATES: readonly number[] = [0, 5, 12, 18, 28, 40];

/**
 * A sellable variation of a product (design/model + size + colour).
 * Price fields are optional overrides; `null` means "use the product price".
 */
export interface ProductVariant {
  id: string;
  designNo: string;
  sizeId: string;
  colorId: string;
  sku: string;
  barcode: string;
  purchasePrice: number | null;
  sellingPrice: number | null;
  mrp: number | null;
}

export interface Product extends BaseEntity {
  name: string;
  code: string;
  categoryId: string;
  /** Empty string when the product is unbranded. */
  brandId: string;
  description: string;
  productType: ProductType;
  hsnCode: string;
  gstRate: number;
  mrp: number;
  purchasePrice: number | null;
  sellingPrice: number;
  barcode: string;
  variants: ProductVariant[];
}

/** Variants without an id are new; the data source assigns ids on save. */
export type ProductVariantInput = Omit<ProductVariant, 'id'> & { id?: string };

export interface ProductInput extends Omit<EntityInput<Product>, 'variants'> {
  variants: ProductVariantInput[];
}

/** Row shape returned by the product list endpoint (joined display fields). */
export interface ProductListItem extends Product {
  categoryName: string;
  brandName: string;
  variantCount: number;
}

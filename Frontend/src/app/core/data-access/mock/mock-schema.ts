import { Product } from '../../models/product.model';
import { generateId } from '../../utils/id';
import { compareSizes } from '../../utils/size-order';
import { normalizeHex } from '../../utils/sku';
import { cleanText, compareValues, normalizeKey, plural } from '../../utils/text';
import { ApiError } from '../api.types';
import { ResourceName } from '../data-source';
import { MockResourceConfig } from './mock-crud-source';
import { MockDb } from './mock-db';

export type MockSchema = { [K in ResourceName]: MockResourceConfig<K> };

const byName = (a: { name: string }, b: { name: string }) => compareValues(a.name, b.name);

function inUseMessage(noun: string, count: number, by: string): string | null {
  return count > 0 ? `This ${noun} is used by ${plural(count, by)}.` : null;
}

function productsUsing(db: MockDb, predicate: (product: Product) => boolean): number {
  return db.table('products').filter(predicate).length;
}

function money(value: number | null | undefined): number | null {
  return value === null || value === undefined || Number.isNaN(value)
    ? null
    : Math.round(value * 100) / 100;
}

/**
 * Server-side rules for every resource. When the NestJS API is connected these rules live in the
 * backend; this file is only used by the mock data source.
 */
export const MOCK_SCHEMA: MockSchema = {
  categories: {
    noun: 'category',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      description: input.description.trim(),
      status: input.status,
    }),
    toListItem: (row) => row,
    searchText: (row) => `${row.name} ${row.description}`,
    defaultSort: byName,
    unique: [{ field: 'name', label: 'Category' }],
    usage: (id, db) =>
      inUseMessage(
        'category',
        productsUsing(db, (p) => p.categoryId === id),
        'product',
      ),
  },

  brands: {
    noun: 'brand',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      description: input.description.trim(),
      status: input.status,
    }),
    toListItem: (row) => row,
    searchText: (row) => `${row.name} ${row.description}`,
    defaultSort: byName,
    unique: [{ field: 'name', label: 'Brand' }],
    usage: (id, db) =>
      inUseMessage(
        'brand',
        productsUsing(db, (p) => p.brandId === id),
        'product',
      ),
  },

  sizes: {
    noun: 'size',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      type: input.type,
      description: input.description.trim(),
      status: input.status,
    }),
    toListItem: (row) => row,
    searchText: (row) => `${row.name} ${row.type} ${row.description}`,
    defaultSort: compareSizes,
    unique: [{ field: 'name', label: 'Size' }],
    usage: (id, db) =>
      inUseMessage(
        'size',
        productsUsing(db, (p) => p.variants.some((v) => v.sizeId === id)),
        'product',
      ),
  },

  colors: {
    noun: 'colour',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      hexCode: normalizeHex(input.hexCode),
      description: input.description.trim(),
      status: input.status,
    }),
    toListItem: (row) => row,
    searchText: (row) => `${row.name} ${row.hexCode} ${row.description}`,
    defaultSort: byName,
    unique: [{ field: 'name', label: 'Colour' }],
    validate: (record) =>
      record.hexCode
        ? null
        : new ApiError('VALIDATION', 'Enter a valid HEX colour code.', 'hexCode'),
    usage: (id, db) =>
      inUseMessage(
        'colour',
        productsUsing(db, (p) => p.variants.some((v) => v.colorId === id)),
        'product',
      ),
  },

  suppliers: {
    noun: 'supplier',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      contactPerson: cleanText(input.contactPerson),
      mobile: input.mobile.trim(),
      email: input.email.trim().toLowerCase(),
      address: input.address.trim(),
      city: cleanText(input.city),
      state: input.state,
      pincode: input.pincode.trim(),
      gstNumber: input.gstNumber.trim().toUpperCase(),
      openingBalance: money(input.openingBalance) ?? 0,
      status: input.status,
    }),
    toListItem: (row) => row,
    searchText: (row) =>
      `${row.name} ${row.contactPerson} ${row.mobile} ${row.email} ${row.city} ${row.gstNumber}`,
    defaultSort: byName,
    unique: [
      { field: 'name', label: 'Supplier' },
      { field: 'gstNumber', label: 'GST number' },
    ],
  },

  customers: {
    noun: 'customer',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      mobile: input.mobile.trim(),
      email: input.email.trim().toLowerCase(),
      address: input.address.trim(),
      city: cleanText(input.city),
      state: input.state,
      pincode: input.pincode.trim(),
      gstNumber: input.gstNumber.trim().toUpperCase(),
      openingBalance: money(input.openingBalance) ?? 0,
      status: input.status,
    }),
    toListItem: (row) => row,
    searchText: (row) => `${row.name} ${row.mobile} ${row.email} ${row.city} ${row.gstNumber}`,
    defaultSort: byName,
    unique: [
      { field: 'mobile', label: 'Mobile number' },
      { field: 'gstNumber', label: 'GST number' },
    ],
  },

  products: {
    noun: 'product',
    toRecord: (input, meta) => ({
      ...meta,
      name: cleanText(input.name),
      code: cleanText(input.code).toUpperCase(),
      categoryId: input.categoryId,
      brandId: input.brandId,
      description: input.description.trim(),
      productType: input.productType,
      hsnCode: input.hsnCode.trim(),
      gstRate: input.gstRate,
      mrp: money(input.mrp) ?? 0,
      purchasePrice: money(input.purchasePrice),
      sellingPrice: money(input.sellingPrice) ?? 0,
      barcode: input.barcode.trim(),
      status: input.status,
      variants: input.variants.map((variant) => ({
        id: variant.id || generateId(),
        designNo: cleanText(variant.designNo),
        sizeId: variant.sizeId,
        colorId: variant.colorId,
        sku: cleanText(variant.sku).toUpperCase(),
        barcode: variant.barcode.trim(),
        purchasePrice: money(variant.purchasePrice),
        sellingPrice: money(variant.sellingPrice),
        mrp: money(variant.mrp),
      })),
    }),
    toListItem: (row, db) => ({
      ...row,
      categoryName: db.table('categories').find((c) => c.id === row.categoryId)?.name ?? '—',
      brandName: row.brandId
        ? (db.table('brands').find((b) => b.id === row.brandId)?.name ?? '—')
        : '',
      variantCount: row.variants.length,
    }),
    searchText: (row) =>
      [
        row.name,
        row.code,
        row.barcode,
        row.hsnCode,
        row.categoryName,
        row.brandName,
        ...row.variants.flatMap((v) => [v.sku, v.barcode, v.designNo]),
      ].join(' '),
    defaultSort: byName,
    unique: [{ field: 'code', label: 'Product code' }],
    validate: validateProduct,
  },
};

/** Integrity rules for a product and its variants (mirrors what the API must enforce). */
function validateProduct(
  product: Product,
  others: readonly Product[],
  db: MockDb,
): ApiError | null {
  if (!db.table('categories').some((c) => c.id === product.categoryId)) {
    return new ApiError('VALIDATION', 'Select a valid category.', 'categoryId');
  }
  if (product.brandId && !db.table('brands').some((b) => b.id === product.brandId)) {
    return new ApiError('VALIDATION', 'Select a valid brand.', 'brandId');
  }
  if (product.sellingPrice > product.mrp) {
    return new ApiError('VALIDATION', 'Selling price cannot be more than MRP.', 'sellingPrice');
  }

  // Barcodes and SKUs must be unique across all products and variants.
  const barcodeOwners = new Map<string, string>();
  const skuOwners = new Map<string, string>();
  for (const other of others) {
    if (other.barcode) barcodeOwners.set(normalizeKey(other.barcode), other.name);
    for (const variant of other.variants) {
      if (variant.barcode) barcodeOwners.set(normalizeKey(variant.barcode), other.name);
      skuOwners.set(normalizeKey(variant.sku), other.name);
    }
  }

  const productBarcode = normalizeKey(product.barcode);
  if (productBarcode && barcodeOwners.has(productBarcode)) {
    return new ApiError(
      'DUPLICATE',
      `Barcode is already used by "${barcodeOwners.get(productBarcode)}".`,
      'barcode',
    );
  }

  const sizeIds = new Set(db.table('sizes').map((s) => s.id));
  const colorIds = new Set(db.table('colors').map((c) => c.id));
  const combos = new Set<string>();
  const skus = new Set<string>();
  const barcodes = new Set<string>(productBarcode ? [productBarcode] : []);

  for (const [index, variant] of product.variants.entries()) {
    const path = `variants.${index}`;
    if (!sizeIds.has(variant.sizeId)) {
      return new ApiError('VALIDATION', 'Select a valid size.', `${path}.sizeId`);
    }
    if (!colorIds.has(variant.colorId)) {
      return new ApiError('VALIDATION', 'Select a valid colour.', `${path}.colorId`);
    }
    const combo = [normalizeKey(variant.designNo), variant.sizeId, variant.colorId].join('|');
    if (combos.has(combo)) {
      return new ApiError(
        'DUPLICATE',
        'This design, size and colour combination is repeated.',
        `${path}.sizeId`,
      );
    }
    combos.add(combo);

    const sku = normalizeKey(variant.sku);
    if (!sku) {
      return new ApiError('VALIDATION', 'SKU is required.', `${path}.sku`);
    }
    if (skuOwners.has(sku)) {
      return new ApiError(
        'DUPLICATE',
        `SKU is already used by "${skuOwners.get(sku)}".`,
        `${path}.sku`,
      );
    }
    if (skus.has(sku)) {
      return new ApiError('DUPLICATE', 'SKU is repeated in this product.', `${path}.sku`);
    }
    skus.add(sku);

    const barcode = normalizeKey(variant.barcode);
    if (barcode) {
      if (barcodeOwners.has(barcode)) {
        return new ApiError(
          'DUPLICATE',
          `Barcode is already used by "${barcodeOwners.get(barcode)}".`,
          `${path}.barcode`,
        );
      }
      if (barcodes.has(barcode)) {
        return new ApiError('DUPLICATE', 'Barcode is repeated in this product.', `${path}.barcode`);
      }
      barcodes.add(barcode);
    }

    const mrp = variant.mrp ?? product.mrp;
    const selling = variant.sellingPrice ?? product.sellingPrice;
    if (selling > mrp) {
      return new ApiError(
        'VALIDATION',
        'Selling price cannot be more than MRP.',
        `${path}.sellingPrice`,
      );
    }
  }
  return null;
}

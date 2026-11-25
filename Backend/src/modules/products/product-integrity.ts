import type { Queryable } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CodeCheckScope, ProductsRepository, ReferenceTable } from './products.repository.js';

/** Builds the error `field` for a variant property, e.g. "variants.2.sku" or just "sku". */
export type VariantPath = (index: number, field: string) => string;

export const inProductPayload: VariantPath = (index, field) => `variants.${index}.${field}`;
export const singleVariant: VariantPath = (_index, field) => field;

const LABELS: Record<ReferenceTable, string> = {
  categories: 'category',
  brands: 'brand',
  sizes: 'size',
  colors: 'colour',
};

/**
 * Referenced master records must exist. Inactive ones may only be kept when the record
 * already used them (so editing an old product never forces a change), never newly chosen.
 */
export async function assertReferences(
  repo: ProductsRepository,
  db: Queryable,
  table: ReferenceTable,
  refs: readonly { id: string; field: string; alreadyUsed: boolean }[],
): Promise<void> {
  const statuses = await repo.findStatuses(
    db,
    table,
    refs.map((ref) => ref.id),
  );
  for (const ref of refs) {
    const status = statuses.get(ref.id);
    if (!status) {
      throw AppError.validation(`The selected ${LABELS[table]} does not exist.`, ref.field);
    }
    if (status === 'inactive' && !ref.alreadyUsed) {
      throw AppError.validation(
        `The selected ${LABELS[table]} is inactive. Activate it or choose another.`,
        ref.field,
      );
    }
  }
}

/** Size and colour references of a list of variants. */
export async function assertVariantReferences(
  repo: ProductsRepository,
  db: Queryable,
  variants: readonly { sizeId: string; colorId: string }[],
  path: VariantPath,
  alreadyUsed: { sizeIds: ReadonlySet<string>; colorIds: ReadonlySet<string> },
): Promise<void> {
  await assertReferences(
    repo,
    db,
    'sizes',
    variants.map((variant, index) => ({
      id: variant.sizeId,
      field: path(index, 'sizeId'),
      alreadyUsed: alreadyUsed.sizeIds.has(variant.sizeId),
    })),
  );
  await assertReferences(
    repo,
    db,
    'colors',
    variants.map((variant, index) => ({
      id: variant.colorId,
      field: path(index, 'colorId'),
      alreadyUsed: alreadyUsed.colorIds.has(variant.colorId),
    })),
  );
}

/**
 * SKUs and barcodes must be unique across the whole catalogue (product and variant barcodes
 * share one namespace so a scan always resolves to exactly one item).
 */
export async function assertCodesAvailable(
  repo: ProductsRepository,
  db: Queryable,
  codes: {
    readonly productBarcode?: string;
    readonly variants: readonly { sku: string; barcode: string }[];
  },
  scope: CodeCheckScope,
  path: VariantPath,
): Promise<void> {
  const barcodes = [codes.productBarcode ?? '', ...codes.variants.map((v) => v.barcode)].filter(
    Boolean,
  );
  const barcodeOwners = new Map(
    (await repo.findBarcodeOwners(db, barcodes, scope)).map((owner) => [
      owner.code,
      owner.productName,
    ]),
  );
  const productBarcodeOwner =
    codes.productBarcode && barcodeOwners.get(codes.productBarcode.toLowerCase());
  if (productBarcodeOwner) {
    throw AppError.duplicate(`Barcode is already used by "${productBarcodeOwner}".`, 'barcode');
  }

  const skuOwners = new Map(
    (
      await repo.findSkuOwners(
        db,
        codes.variants.map((v) => v.sku),
        scope,
      )
    ).map((owner) => [owner.code, owner.productName]),
  );

  for (const [index, variant] of codes.variants.entries()) {
    const skuOwner = skuOwners.get(variant.sku.toLowerCase());
    if (skuOwner) {
      throw AppError.duplicate(`SKU is already used by "${skuOwner}".`, path(index, 'sku'));
    }
    const barcodeOwner = variant.barcode && barcodeOwners.get(variant.barcode.toLowerCase());
    if (barcodeOwner) {
      throw AppError.duplicate(
        `Barcode is already used by "${barcodeOwner}".`,
        path(index, 'barcode'),
      );
    }
  }
}

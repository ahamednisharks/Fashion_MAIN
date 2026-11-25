import {
  AbstractControl,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { EntityStatus } from '../../../core/models/base.model';
import {
  Product,
  ProductInput,
  ProductType,
  ProductVariant,
  ProductVariantInput,
} from '../../../core/models/product.model';
import { normalizeKey } from '../../../core/utils/text';
import { AppValidators } from '../../../shared/forms/app-validators';

export type VariantFormGroup = FormGroup<{
  id: FormControl<string>;
  designNo: FormControl<string>;
  sizeId: FormControl<string>;
  colorId: FormControl<string>;
  sku: FormControl<string>;
  barcode: FormControl<string>;
  purchasePrice: FormControl<number | null>;
  sellingPrice: FormControl<number | null>;
  mrp: FormControl<number | null>;
}>;

export type VariantFormValue = ReturnType<VariantFormGroup['getRawValue']>;

/** Row-level problems found by `variantsValidator`, keyed by row index. */
export type VariantRowIssues = Readonly<Record<number, readonly string[]>>;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

export function createVariantGroup(
  fb: NonNullableFormBuilder,
  variant?: Partial<ProductVariant>,
): VariantFormGroup {
  return fb.group({
    id: [variant?.id ?? ''],
    designNo: [variant?.designNo ?? '', Validators.maxLength(30)],
    sizeId: [variant?.sizeId ?? '', AppValidators.required],
    colorId: [variant?.colorId ?? '', AppValidators.required],
    sku: [
      variant?.sku ?? '',
      [AppValidators.required, Validators.maxLength(60), AppValidators.code],
    ],
    barcode: [variant?.barcode ?? '', AppValidators.barcode],
    purchasePrice: fb.control<number | null>(variant?.purchasePrice ?? null, AppValidators.money()),
    sellingPrice: fb.control<number | null>(variant?.sellingPrice ?? null, AppValidators.money()),
    mrp: fb.control<number | null>(variant?.mrp ?? null, AppValidators.money()),
  });
}

/**
 * Cross-row rules for the variants array (reads base prices / barcode from the parent form):
 * unique design+size+colour, unique SKU and barcode, selling price ≤ MRP after overrides.
 */
export function variantsValidator(control: AbstractControl): ValidationErrors | null {
  const raw: unknown = control.value;
  if (!Array.isArray(raw)) {
    return null;
  }
  const rows = raw as VariantFormValue[];
  const parent = control.parent;
  const baseMrp = numberOrNull(parent?.get('mrp')?.value);
  const baseSelling = numberOrNull(parent?.get('sellingPrice')?.value);
  const productBarcode = normalizeKey(parent?.get('barcode')?.value);

  const issues: Record<number, string[]> = {};
  const add = (index: number, message: string) => (issues[index] ??= []).push(message);
  const combos = new Map<string, number>();
  const skus = new Map<string, number>();
  const barcodes = new Map<string, number>();

  rows.forEach((row, index) => {
    if (row.sizeId && row.colorId) {
      const combo = [normalizeKey(row.designNo), row.sizeId, row.colorId].join('|');
      const first = combos.get(combo);
      if (first === undefined) combos.set(combo, index);
      else add(index, `Same design, size and colour as variant ${first + 1}.`);
    }

    const sku = normalizeKey(row.sku);
    if (sku) {
      const first = skus.get(sku);
      if (first === undefined) skus.set(sku, index);
      else add(index, `SKU is the same as variant ${first + 1}.`);
    }

    const barcode = normalizeKey(row.barcode);
    if (barcode) {
      if (barcode === productBarcode) {
        add(index, 'Barcode is the same as the product barcode.');
      }
      const first = barcodes.get(barcode);
      if (first === undefined) barcodes.set(barcode, index);
      else add(index, `Barcode is the same as variant ${first + 1}.`);
    }

    const mrp = numberOrNull(row.mrp) ?? baseMrp;
    const selling = numberOrNull(row.sellingPrice) ?? baseSelling;
    if (mrp !== null && selling !== null && selling > mrp) {
      add(index, 'Selling price is more than MRP for this variant.');
    }
  });

  return Object.keys(issues).length ? { variantRows: issues } : null;
}

export function createProductForm(fb: NonNullableFormBuilder) {
  return fb.group({
    name: ['', [AppValidators.required, Validators.maxLength(120)]],
    code: ['', [AppValidators.required, Validators.maxLength(30), AppValidators.code]],
    categoryId: ['', AppValidators.required],
    brandId: [''],
    productType: ['readymade' as ProductType],
    description: ['', Validators.maxLength(500)],
    hsnCode: ['', AppValidators.hsn],
    gstRate: [5],
    mrp: fb.control<number | null>(null, [AppValidators.required, AppValidators.money()]),
    sellingPrice: fb.control<number | null>(null, [
      AppValidators.required,
      AppValidators.money(),
      AppValidators.notGreaterThan(
        (control) => numberOrNull(control.parent?.get('mrp')?.value),
        'MRP',
      ),
    ]),
    purchasePrice: fb.control<number | null>(null, AppValidators.money()),
    barcode: ['', AppValidators.barcode],
    status: ['active' as EntityStatus],
    variants: fb.array<VariantFormGroup>([], variantsValidator),
  });
}

export type ProductForm = ReturnType<typeof createProductForm>;

export function patchProductForm(
  form: ProductForm,
  product: Product,
  fb: NonNullableFormBuilder,
): void {
  const { variants, ...fields } = product;
  form.controls.variants.clear({ emitEvent: false });
  for (const variant of variants) {
    form.controls.variants.push(createVariantGroup(fb, variant), { emitEvent: false });
  }
  form.reset(fields);
}

export function toProductInput(form: ProductForm): ProductInput {
  const value = form.getRawValue();
  return {
    ...value,
    mrp: value.mrp ?? 0,
    sellingPrice: value.sellingPrice ?? 0,
    variants: value.variants.map(({ id, ...variant }): ProductVariantInput =>
      id ? { id, ...variant } : variant,
    ),
  };
}

/** Suggests a product code from the category name, e.g. "Men's Shirts" → "MS-4821". */
export function suggestProductCode(categoryName: string): string {
  const words = categoryName
    .replace(/['’]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const prefix =
    words.length > 1
      ? words
          .map((word) => word[0])
          .join('')
          .slice(0, 3)
      : (words[0] ?? 'PRD').slice(0, 3);
  return `${prefix}-${1000 + Math.floor(Math.random() * 9000)}`;
}

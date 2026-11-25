import { type TransactionClient, withTransaction } from '../../../config/database.js';
import { AppError } from '../../../common/errors/app-error.js';
import { normalizeKey } from '../../../common/utils/text.js';
import {
  assertCodesAvailable,
  assertVariantReferences,
  singleVariant,
} from '../product-integrity.js';
import { ProductsRepository } from '../products.repository.js';
import type { Product } from '../products.schema.js';
import type { Variant, VariantInput } from './variants.schema.js';

function comboKey(variant: { designNo: string; sizeId: string; colorId: string }): string {
  return [normalizeKey(variant.designNo), variant.sizeId, variant.colorId].join('|');
}

/** Single-variant operations under /products/:productId/variants. */
export class VariantsService {
  constructor(private readonly products = new ProductsRepository()) {}

  async list(productId: string): Promise<Variant[]> {
    const product = (await this.products.findById(productId)) ?? productNotFound();
    return product.variants;
  }

  async get(productId: string, variantId: string): Promise<Variant> {
    return (await this.products.variants.findById(productId, variantId)) ?? variantNotFound();
  }

  create(productId: string, input: VariantInput): Promise<Variant> {
    return withTransaction(async (tx) => {
      await this.products.lockCatalogCodes(tx);
      const product = (await this.products.findById(productId, tx)) ?? productNotFound();
      await this.validate(tx, product, input, null);
      const position = await this.products.variants.nextPosition(tx, productId);
      const id = await this.products.variants.insert(tx, productId, input, position);
      return (await this.products.variants.findById(productId, id, tx)) ?? variantNotFound();
    });
  }

  update(productId: string, variantId: string, input: VariantInput): Promise<Variant> {
    return withTransaction(async (tx) => {
      await this.products.lockCatalogCodes(tx);
      const product = (await this.products.findById(productId, tx)) ?? productNotFound();
      const existing =
        product.variants.find((variant) => variant.id === variantId) ?? variantNotFound();
      await this.validate(tx, product, input, existing);
      await this.products.variants.update(tx, variantId, input);
      return (await this.products.variants.findById(productId, variantId, tx)) ?? variantNotFound();
    });
  }

  async remove(productId: string, variantId: string): Promise<void> {
    if (!(await this.products.variants.delete(productId, variantId))) {
      variantNotFound();
    }
  }

  private async validate(
    tx: TransactionClient,
    product: Product,
    input: VariantInput,
    existing: Variant | null,
  ): Promise<void> {
    const mrp = input.mrp ?? product.mrp;
    const selling = input.sellingPrice ?? product.sellingPrice;
    if (selling > mrp) {
      throw AppError.validation(
        'Selling price cannot be more than MRP for this variant.',
        'sellingPrice',
      );
    }

    const key = comboKey(input);
    if (
      product.variants.some((variant) => variant.id !== existing?.id && comboKey(variant) === key)
    ) {
      throw AppError.duplicate(
        'This product already has a variant with the same design, size and colour.',
        'sizeId',
      );
    }

    await assertVariantReferences(this.products, tx, [input], singleVariant, {
      sizeIds: new Set(existing ? [existing.sizeId] : []),
      colorIds: new Set(existing ? [existing.colorId] : []),
    });
    await assertCodesAvailable(
      this.products,
      tx,
      { variants: [input] },
      { excludeVariantId: existing?.id ?? null },
      singleVariant,
    );
  }
}

function productNotFound(): never {
  throw AppError.notFound('Product not found.');
}

function variantNotFound(): never {
  throw AppError.notFound('Variant not found.');
}

export const variantsService = new VariantsService();

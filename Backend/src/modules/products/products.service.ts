import { type TransactionClient, withTransaction } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Paged } from '../../common/utils/pagination.js';
import type { EntityStatus } from '../../common/validators/fields.js';
import {
  assertCodesAvailable,
  assertReferences,
  assertVariantReferences,
  inProductPayload,
} from './product-integrity.js';
import { ProductsRepository } from './products.repository.js';
import type { Product, ProductInput, ProductListQuery, ProductSummary } from './products.schema.js';

export class ProductsService {
  constructor(private readonly products = new ProductsRepository()) {}

  list(query: ProductListQuery): Promise<Paged<ProductSummary>> {
    return this.products.list(query);
  }

  lookup(status?: EntityStatus): Promise<ProductSummary[]> {
    return this.products.findAll(status);
  }

  async get(id: string): Promise<Product> {
    return (await this.products.findById(id)) ?? notFound();
  }

  /** Creates a product and its variants atomically. */
  create(input: ProductInput): Promise<Product> {
    return withTransaction(async (tx) => {
      await this.products.lockCatalogCodes(tx);
      await this.validate(tx, input, null);
      const id = await this.products.insert(tx, input);
      for (const [position, variant] of input.variants.entries()) {
        await this.products.variants.insert(tx, id, variant, position);
      }
      return (await this.products.findById(id, tx)) ?? notFound();
    });
  }

  /**
   * Replaces the product and synchronises its variants: variants with an `id` are updated,
   * variants without one are added, and existing variants left out of the payload are deleted.
   */
  update(id: string, input: ProductInput): Promise<Product> {
    return withTransaction(async (tx) => {
      await this.products.lockCatalogCodes(tx);
      const existing = (await this.products.findById(id, tx)) ?? notFound();

      const ownVariantIds = new Set(existing.variants.map((variant) => variant.id));
      for (const [index, variant] of input.variants.entries()) {
        if (variant.id && !ownVariantIds.has(variant.id)) {
          throw AppError.validation(
            'This variant does not belong to the product.',
            inProductPayload(index, 'id'),
          );
        }
      }
      await this.validate(tx, input, existing);

      await this.products.update(tx, id, input);
      const keepIds = input.variants.flatMap((variant) => (variant.id ? [variant.id] : []));
      await this.products.variants.deleteExcept(tx, id, keepIds);
      await this.products.variants.parkUniqueKeys(tx, id);
      for (const [position, variant] of input.variants.entries()) {
        if (variant.id) {
          await this.products.variants.update(tx, variant.id, variant, position);
        } else {
          await this.products.variants.insert(tx, id, variant, position);
        }
      }
      return (await this.products.findById(id, tx)) ?? notFound();
    });
  }

  async setStatus(id: string, status: EntityStatus): Promise<Product> {
    if (!(await this.products.setStatus(id, status))) {
      notFound();
    }
    return this.get(id);
  }

  /**
   * Deletes the product with its variants. Products / variants on bills or purchase orders are
   * protected by RESTRICT foreign keys (409 IN_USE — deactivate instead).
   */
  async remove(id: string): Promise<void> {
    if (!(await this.products.delete(id))) {
      notFound();
    }
  }

  isTaken(field: 'code' | 'barcode' | 'sku', value: string, excludeId?: string): Promise<boolean> {
    return this.products.isTaken(field, value, excludeId);
  }

  /** Database-backed rules (payload rules are already checked by the request schema). */
  private async validate(
    tx: TransactionClient,
    input: ProductInput,
    existing: Product | null,
  ): Promise<void> {
    if (await this.products.isCodeTaken(input.code, existing?.id ?? null, tx)) {
      throw AppError.duplicate('Another product already uses this product code.', 'code');
    }

    await assertReferences(this.products, tx, 'categories', [
      {
        id: input.categoryId,
        field: 'categoryId',
        alreadyUsed: existing?.categoryId === input.categoryId,
      },
    ]);
    if (input.brandId) {
      await assertReferences(this.products, tx, 'brands', [
        { id: input.brandId, field: 'brandId', alreadyUsed: existing?.brandId === input.brandId },
      ]);
    }
    await assertVariantReferences(this.products, tx, input.variants, inProductPayload, {
      sizeIds: new Set(existing?.variants.map((variant) => variant.sizeId)),
      colorIds: new Set(existing?.variants.map((variant) => variant.colorId)),
    });

    await assertCodesAvailable(
      this.products,
      tx,
      { productBarcode: input.barcode, variants: input.variants },
      { excludeProductId: existing?.id ?? null },
      inProductPayload,
    );
  }
}

function notFound(): never {
  throw AppError.notFound('Product not found.');
}

export const productsService = new ProductsService();

import { variantsService } from './variants.service.js';
import type { ProductParams, VariantInput, VariantParams } from './variants.schema.js';

/** HTTP → service mapping for /products/:productId/variants. */
export class VariantsController {
  constructor(private readonly service = variantsService) {}

  readonly list = (params: ProductParams) => this.service.list(params.productId);

  readonly getById = (params: VariantParams) =>
    this.service.get(params.productId, params.variantId);

  readonly create = (params: ProductParams, body: VariantInput) =>
    this.service.create(params.productId, body);

  readonly update = (params: VariantParams, body: VariantInput) =>
    this.service.update(params.productId, params.variantId, body);

  readonly remove = (params: VariantParams): Promise<void> =>
    this.service.remove(params.productId, params.variantId);
}

export const variantsController = new VariantsController();

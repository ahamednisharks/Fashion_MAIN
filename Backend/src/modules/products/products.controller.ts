import type { IdParams, LookupQuery, StatusBody } from '../../common/validators/list-query.js';
import type { ProductInput, ProductListQuery } from './products.schema.js';
import { productsService } from './products.service.js';

export interface ProductExistsQuery {
  field: 'code' | 'barcode' | 'sku';
  value: string;
  excludeId?: string;
}

/** HTTP → service mapping for /products. */
export class ProductsController {
  constructor(private readonly service = productsService) {}

  readonly list = (query: ProductListQuery) => this.service.list(query);

  readonly lookup = (query: LookupQuery) => this.service.lookup(query.status);

  readonly exists = async (query: ProductExistsQuery) => ({
    exists: await this.service.isTaken(query.field, query.value, query.excludeId),
  });

  readonly getById = (params: IdParams) => this.service.get(params.id);

  readonly create = (body: ProductInput) => this.service.create(body);

  readonly update = (params: IdParams, body: ProductInput) => this.service.update(params.id, body);

  readonly setStatus = (params: IdParams, body: StatusBody) =>
    this.service.setStatus(params.id, body.status);

  readonly remove = (params: IdParams): Promise<void> => this.service.remove(params.id);
}

export const productsController = new ProductsController();

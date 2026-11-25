import { MasterService } from '../../common/crud/master.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { plural } from '../../common/utils/text.js';
import { BrandsRepository } from './brands.repository.js';
import type { Brand, BrandInput, BrandListQuery } from './brands.schema.js';

export class BrandsService extends MasterService<Brand, BrandInput, BrandListQuery> {
  constructor(private readonly brands = new BrandsRepository()) {
    super(brands, 'Brand');
  }

  /** A brand used by products cannot be deleted — it can be deactivated instead. */
  protected override async assertDeletable(id: string): Promise<void> {
    const count = await this.brands.countProducts(id);
    if (count > 0) {
      throw AppError.inUse(
        `This brand is used by ${plural(count, 'product')}. Deactivate it instead.`,
      );
    }
  }
}

export const brandsService = new BrandsService();

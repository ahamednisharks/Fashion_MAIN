import { MasterService } from '../../common/crud/master.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { plural } from '../../common/utils/text.js';
import { SizesRepository } from './sizes.repository.js';
import type { Size, SizeInput, SizeListQuery } from './sizes.schema.js';

export class SizesService extends MasterService<Size, SizeInput, SizeListQuery> {
  constructor(private readonly sizes = new SizesRepository()) {
    super(sizes, 'Size');
  }

  /** A size used by product variants cannot be deleted — it can be deactivated instead. */
  protected override async assertDeletable(id: string): Promise<void> {
    const count = await this.sizes.countProducts(id);
    if (count > 0) {
      throw AppError.inUse(
        `This size is used by variants of ${plural(count, 'product')}. Deactivate it instead.`,
      );
    }
  }
}

export const sizesService = new SizesService();

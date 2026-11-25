import { MasterService } from '../../common/crud/master.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { plural } from '../../common/utils/text.js';
import { CategoriesRepository } from './categories.repository.js';
import type { Category, CategoryInput, CategoryListQuery } from './categories.schema.js';

export class CategoriesService extends MasterService<Category, CategoryInput, CategoryListQuery> {
  constructor(private readonly categories = new CategoriesRepository()) {
    super(categories, 'Category');
  }

  /** A category used by products cannot be deleted — it can be deactivated instead. */
  protected override async assertDeletable(id: string): Promise<void> {
    const count = await this.categories.countProducts(id);
    if (count > 0) {
      throw AppError.inUse(
        `This category is used by ${plural(count, 'product')}. Deactivate it instead.`,
      );
    }
  }
}

export const categoriesService = new CategoriesService();

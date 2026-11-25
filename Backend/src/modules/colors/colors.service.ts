import { MasterService } from '../../common/crud/master.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { plural } from '../../common/utils/text.js';
import { ColorsRepository } from './colors.repository.js';
import type { Color, ColorInput, ColorListQuery } from './colors.schema.js';

export class ColorsService extends MasterService<Color, ColorInput, ColorListQuery> {
  constructor(private readonly colors = new ColorsRepository()) {
    super(colors, 'Colour');
  }

  /** A colour used by product variants cannot be deleted — it can be deactivated instead. */
  protected override async assertDeletable(id: string): Promise<void> {
    const count = await this.colors.countProducts(id);
    if (count > 0) {
      throw AppError.inUse(
        `This colour is used by variants of ${plural(count, 'product')}. Deactivate it instead.`,
      );
    }
  }
}

export const colorsService = new ColorsService();

import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';

import { BrandService } from '../../../core/data-access/brand.service';
import { CategoryService } from '../../../core/data-access/category.service';
import { ColorService } from '../../../core/data-access/color.service';
import { SizeService } from '../../../core/data-access/size.service';
import { Brand } from '../../../core/models/brand.model';
import { Category } from '../../../core/models/category.model';
import { Color } from '../../../core/models/color.model';
import { Size } from '../../../core/models/size.model';

/** Master data referenced by products (for dropdowns and display names). */
export interface ProductLookups {
  readonly categories: readonly Category[];
  readonly brands: readonly Brand[];
  readonly sizes: readonly Size[];
  readonly colors: readonly Color[];
}

@Injectable({ providedIn: 'root' })
export class ProductLookupsService {
  private readonly categories = inject(CategoryService);
  private readonly brands = inject(BrandService);
  private readonly sizes = inject(SizeService);
  private readonly colors = inject(ColorService);

  /** Loads all records (active and inactive) so existing references always resolve. */
  load(): Observable<ProductLookups> {
    return forkJoin({
      categories: this.categories.getAll(),
      brands: this.brands.getAll(),
      sizes: this.sizes.getAll(),
      colors: this.colors.getAll(),
    });
  }
}

/** Active records plus any inactive ones that are already in use (so selections stay valid). */
export function selectableOptions<T extends { id: string; status: string }>(
  items: readonly T[],
  inUseIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => item.status === 'active' || inUseIds.has(item.id));
}

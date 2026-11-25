import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Category master data access. */
@Injectable({ providedIn: 'root' })
export class CategoryService extends MasterDataService<'categories'> {
  constructor() {
    super('categories');
  }
}

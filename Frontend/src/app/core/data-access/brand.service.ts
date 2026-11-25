import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Brand master data access. */
@Injectable({ providedIn: 'root' })
export class BrandService extends MasterDataService<'brands'> {
  constructor() {
    super('brands');
  }
}

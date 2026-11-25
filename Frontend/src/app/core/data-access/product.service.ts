import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Product master data access (products and their variants). */
@Injectable({ providedIn: 'root' })
export class ProductService extends MasterDataService<'products'> {
  constructor() {
    super('products');
  }
}

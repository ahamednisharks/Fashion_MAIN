import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Supplier master data access. */
@Injectable({ providedIn: 'root' })
export class SupplierService extends MasterDataService<'suppliers'> {
  constructor() {
    super('suppliers');
  }
}

import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Customer master data access. */
@Injectable({ providedIn: 'root' })
export class CustomerService extends MasterDataService<'customers'> {
  constructor() {
    super('customers');
  }
}

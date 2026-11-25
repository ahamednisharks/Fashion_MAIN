import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Size master data access. */
@Injectable({ providedIn: 'root' })
export class SizeService extends MasterDataService<'sizes'> {
  constructor() {
    super('sizes');
  }
}

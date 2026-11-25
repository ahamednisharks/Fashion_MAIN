import { Injectable } from '@angular/core';

import { MasterDataService } from './master-data.service';

/** Colour master data access. */
@Injectable({ providedIn: 'root' })
export class ColorService extends MasterDataService<'colors'> {
  constructor() {
    super('colors');
  }
}

import { inject } from '@angular/core';
import { Observable } from 'rxjs';

import { EntityStatus } from '../models/base.model';
import { ListQuery, PagedResult } from './api.types';
import {
  DATA_SOURCE_FACTORY,
  DataSourceOf,
  EntityOf,
  InputOf,
  ItemOf,
  ResourceName,
} from './data-source';

/**
 * Base class for master-data services. Components depend on the concrete services
 * (CategoryService, ProductService, ...) and never on the data source directly.
 */
export abstract class MasterDataService<K extends ResourceName> {
  protected readonly source: DataSourceOf<K>;

  protected constructor(resource: K) {
    this.source = inject(DATA_SOURCE_FACTORY).create(resource);
  }

  list(query: ListQuery): Observable<PagedResult<ItemOf<K>>> {
    return this.source.list(query);
  }

  /** All records as list rows, optionally filtered by status (dropdowns, lookups, dashboard). */
  getAll(options?: { status?: EntityStatus }): Observable<ItemOf<K>[]> {
    return this.source.getAll(options);
  }

  getById(id: string): Observable<EntityOf<K>> {
    return this.source.getById(id);
  }

  create(input: InputOf<K>): Observable<EntityOf<K>> {
    return this.source.create(input);
  }

  update(id: string, input: InputOf<K>): Observable<EntityOf<K>> {
    return this.source.update(id, input);
  }

  setStatus(id: string, status: EntityStatus): Observable<EntityOf<K>> {
    return this.source.setStatus(id, status);
  }

  remove(id: string): Observable<void> {
    return this.source.remove(id);
  }

  isTaken(field: string, value: string, excludeId?: string): Observable<boolean> {
    return this.source.isTaken(field, value, excludeId);
  }
}

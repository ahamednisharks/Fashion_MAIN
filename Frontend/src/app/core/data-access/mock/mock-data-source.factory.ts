import { Injectable, inject } from '@angular/core';

import { DataSourceFactory, DataSourceOf, ResourceName } from '../data-source';
import { MockCrudSource } from './mock-crud-source';
import { MockDb } from './mock-db';
import { MOCK_SCHEMA } from './mock-schema';

/** Provides localStorage-backed data sources for development (see app.config.ts). */
@Injectable()
export class MockDataSourceFactory implements DataSourceFactory {
  private readonly db = inject(MockDb);

  create<K extends ResourceName>(resource: K): DataSourceOf<K> {
    return new MockCrudSource(this.db, resource, MOCK_SCHEMA[resource]);
  }
}

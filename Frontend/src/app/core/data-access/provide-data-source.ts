import { Provider } from '@angular/core';

import { API_BASE_URL, DATA_SOURCE_FACTORY, DATA_SOURCE_MODE, DataSourceMode } from './data-source';
import { HttpDataSourceFactory } from './http/http-data-source.factory';
import { MockDataSourceFactory } from './mock/mock-data-source.factory';

/**
 * Chooses where master data comes from:
 *   'api'  — the Fashion REST API (default). In development the Angular dev server proxies
 *            `/api` to the backend (see proxy.conf.mjs).
 *   'mock' — in-browser demo data stored in localStorage (no backend needed).
 */
export function provideDataSource(mode: DataSourceMode, apiBaseUrl = '/api/v1'): Provider[] {
  return [
    { provide: DATA_SOURCE_MODE, useValue: mode },
    { provide: API_BASE_URL, useValue: apiBaseUrl },
    {
      provide: DATA_SOURCE_FACTORY,
      useClass: mode === 'api' ? HttpDataSourceFactory : MockDataSourceFactory,
    },
  ];
}

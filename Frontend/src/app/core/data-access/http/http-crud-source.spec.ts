import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ApiError } from '../api.types';
import { DATA_SOURCE_FACTORY, DataSourceFactory } from '../data-source';
import { provideDataSource } from '../provide-data-source';

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the request to fail');
}

describe('HttpCrudSource', () => {
  let factory: DataSourceFactory;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideDataSource('api', '/api/v1'),
      ],
    });
    factory = TestBed.inject(DATA_SOURCE_FACTORY);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the list query to API parameters and unwraps the envelope', async () => {
    const result = firstValueFrom(
      factory.create('sizes').list({
        search: 'xl',
        status: '',
        filters: { type: 'clothing', unused: '' },
        page: 2,
        pageSize: 25,
        sort: { field: 'name', direction: 'desc' },
      }),
    );
    const request = http.expectOne((req) => req.url === '/api/v1/sizes');
    const params = request.request.params;
    expect(params.get('search')).toBe('xl');
    expect(params.has('status')).toBe(false);
    expect(params.get('type')).toBe('clothing');
    expect(params.has('unused')).toBe(false);
    expect([params.get('page'), params.get('pageSize')]).toEqual(['2', '25']);
    expect([params.get('sortBy'), params.get('sortOrder')]).toEqual(['name', 'desc']);

    request.flush({
      success: true,
      data: { items: [], total: 30, page: 2, pageSize: 25, totalPages: 2 },
    });
    expect(await result).toEqual({ items: [], total: 30, page: 2, pageSize: 25 });
  });

  it('uses /lookup, /exists and /{id}/status endpoints', async () => {
    const source = factory.create('customers');

    const all = firstValueFrom(source.getAll({ status: 'active' }));
    const lookup = http.expectOne('/api/v1/customers/lookup?status=active');
    lookup.flush({ success: true, data: [] });
    expect(await all).toEqual([]);

    const taken = firstValueFrom(source.isTaken('mobile', '9876543210', 'abc'));
    http
      .expectOne('/api/v1/customers/exists?field=mobile&value=9876543210&excludeId=abc')
      .flush({ success: true, data: { exists: true } });
    expect(await taken).toBe(true);

    const status = firstValueFrom(source.setStatus('abc', 'inactive'));
    const patch = http.expectOne('/api/v1/customers/abc/status');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'inactive' });
    patch.flush({ success: true, data: { id: 'abc', status: 'inactive' } });
    expect((await status).status).toBe('inactive');
  });

  it('normalises products: null brand → "" and missing variants → []', async () => {
    const page = firstValueFrom(
      factory
        .create('products')
        .list({ search: '', status: '', filters: {}, page: 1, pageSize: 10, sort: null }),
    );
    http
      .expectOne((req) => req.url === '/api/v1/products')
      .flush({
        success: true,
        data: {
          items: [{ id: 'p1', name: 'Stole', brandId: null, brandName: null, variantCount: 0 }],
          total: 1,
          page: 1,
          pageSize: 10,
        },
      });
    const [item] = (await page).items;
    expect(item.brandId).toBe('');
    expect(item.brandName).toBe('');
    expect(item.variants).toEqual([]);
  });

  it('turns API errors into ApiError with the field path', async () => {
    const save = firstValueFrom(factory.create('products').update('p1', {} as never));
    http.expectOne('/api/v1/products/p1').flush(
      {
        success: false,
        error: {
          code: 'DUPLICATE',
          message: 'SKU is already used by "Shirt".',
          field: 'variants.0.sku',
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    const error = await rejection(save);
    expect([error.code, error.field, error.message]).toEqual([
      'DUPLICATE',
      'variants.0.sku',
      'SKU is already used by "Shirt".',
    ]);
  });

  it('reports NETWORK when the backend cannot be reached', async () => {
    const load = firstValueFrom(factory.create('brands').getById('b1'));
    http.expectOne('/api/v1/brands/b1').error(new ProgressEvent('error'), { status: 0 });
    expect((await rejection(load)).code).toBe('NETWORK');

    const proxied = firstValueFrom(factory.create('brands').getById('b2'));
    http.expectOne('/api/v1/brands/b2').flush('', { status: 504, statusText: 'Gateway Timeout' });
    expect((await rejection(proxied)).code).toBe('NETWORK');
  });

  it('explains when a web page comes back instead of API data (proxy not active)', async () => {
    const load = firstValueFrom(factory.create('brands').getAll());
    http
      .expectOne('/api/v1/brands/lookup')
      .flush('<!doctype html><html></html>', { status: 200, statusText: 'OK' });
    const error = await rejection(load);
    expect(error.code).toBe('NETWORK');
    expect(error.message).toContain('npm start');
  });

  it('resolves deletes on 204 No Content', async () => {
    const removed = firstValueFrom(factory.create('colors').remove('c1'));
    const request = http.expectOne('/api/v1/colors/c1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await expect(removed).resolves.toBeUndefined();
  });
});

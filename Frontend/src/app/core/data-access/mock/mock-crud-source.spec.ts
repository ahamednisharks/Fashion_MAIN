import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ApiError, ListQuery } from '../api.types';
import { DATA_SOURCE_FACTORY, DataSourceFactory } from '../data-source';
import { MockDataSourceFactory } from './mock-data-source.factory';
import { MockDb } from './mock-db';

const query = (overrides: Partial<ListQuery> = {}): ListQuery => ({
  search: '',
  status: '',
  filters: {},
  page: 1,
  pageSize: 50,
  sort: null,
  ...overrides,
});

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
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

describe('MockCrudSource', () => {
  let factory: DataSourceFactory;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: DATA_SOURCE_FACTORY, useClass: MockDataSourceFactory }],
    });
    // Remove artificial latency so tests run instantly.
    Object.defineProperty(TestBed.inject(MockDb), 'latencyMs', { value: 0 });
    factory = TestBed.inject(DATA_SOURCE_FACTORY);
  });

  it('searches, filters and paginates', async () => {
    const products = factory.create('products');
    const bySku = await firstValueFrom(products.list(query({ search: 'jns-2001-bh-11' })));
    expect(bySku.items.map((p) => p.name)).toEqual(['Slim Fit Stretch Jeans']);

    const jeans = await firstValueFrom(
      products.list(query({ filters: { categoryId: 'cat-jeans' } })),
    );
    expect(jeans.total).toBe(1);
    expect(jeans.items[0].categoryName).toBe('Jeans');

    const page2 = await firstValueFrom(
      factory.create('categories').list(query({ page: 2, pageSize: 10 })),
    );
    expect(page2.items.length).toBe(3);
    expect(page2.total).toBe(13);
  });

  it('rejects duplicate names case-insensitively', async () => {
    const categories = factory.create('categories');
    const error = await apiError(
      firstValueFrom(categories.create({ name: '  sarees ', description: '', status: 'active' })),
    );
    expect(error.code).toBe('DUPLICATE');
    expect(error.field).toBe('name');
  });

  it('blocks deleting masters that products use', async () => {
    const error = await apiError(firstValueFrom(factory.create('colors').remove('color-black')));
    expect(error.code).toBe('IN_USE');
    expect(error.message).toContain('2 products');
  });

  it('rejects a variant SKU used by another product, pointing at the variant field', async () => {
    const products = factory.create('products');
    const stole = await firstValueFrom(products.getById('prd-silk-stole'));
    const error = await apiError(
      firstValueFrom(
        products.update(stole.id, {
          ...stole,
          variants: [
            {
              designNo: '',
              sizeId: 'size-free',
              colorId: 'color-gold',
              sku: 'msh-1001-101-blk-m',
              barcode: '',
              purchasePrice: null,
              sellingPrice: null,
              mrp: null,
            },
          ],
        }),
      ),
    );
    expect(error.code).toBe('DUPLICATE');
    expect(error.field).toBe('variants.0.sku');
  });

  it('assigns ids to new variants and keeps existing ones', async () => {
    const products = factory.create('products');
    const shirt = await firstValueFrom(products.getById('prd-cotton-shirt'));
    const updated = await firstValueFrom(
      products.update(shirt.id, {
        ...shirt,
        variants: [
          ...shirt.variants,
          {
            designNo: '102',
            sizeId: 'size-l',
            colorId: 'color-royal',
            sku: 'MSH-1001-102-RBL-L',
            barcode: '',
            purchasePrice: null,
            sellingPrice: null,
            mrp: null,
          },
        ],
      }),
    );
    expect(updated.variants.length).toBe(6);
    expect(updated.variants[0].id).toBe(shirt.variants[0].id);
    expect(updated.variants[5].id).toMatch(/[0-9a-f-]{36}/);
  });
});

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { Product, ProductListItem } from '../../models/product.model';
import { API_BASE_URL, DataSourceFactory, DataSourceOf, ResourceName } from '../data-source';
import { HttpCrudSource, HttpResourceConfig } from './http-crud-source';

type HttpResources = { [K in ResourceName]: HttpResourceConfig<K> };

/**
 * The API returns `brandId: null` for unbranded products and list rows without variants;
 * the frontend model uses '' and always has a variants array.
 */
function normalizeProduct<T extends Product>(product: T): T {
  return {
    ...product,
    brandId: product.brandId ?? '',
    variants: product.variants ?? [],
  };
}

function normalizeProductItem(item: ProductListItem): ProductListItem {
  return { ...normalizeProduct(item), brandName: item.brandName ?? '' };
}

const RESOURCES: HttpResources = {
  categories: { path: '/categories' },
  brands: { path: '/brands' },
  sizes: { path: '/sizes' },
  colors: { path: '/colors' },
  suppliers: { path: '/suppliers' },
  customers: { path: '/customers' },
  products: { path: '/products', toEntity: normalizeProduct, toItem: normalizeProductItem },
};

/** Data sources backed by the Fashion REST API (see Backend/README.md). */
@Injectable()
export class HttpDataSourceFactory implements DataSourceFactory {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');

  create<K extends ResourceName>(resource: K): DataSourceOf<K> {
    const config = RESOURCES[resource];
    return new HttpCrudSource(this.http, `${this.baseUrl}${config.path}`, config);
  }
}

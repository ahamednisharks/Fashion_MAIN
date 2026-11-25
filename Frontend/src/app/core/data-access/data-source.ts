import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { BaseEntity, EntityStatus } from '../models/base.model';
import { Brand, BrandInput } from '../models/brand.model';
import { Category, CategoryInput } from '../models/category.model';
import { Color, ColorInput } from '../models/color.model';
import { Customer, CustomerInput } from '../models/customer.model';
import { Product, ProductInput, ProductListItem } from '../models/product.model';
import { Size, SizeInput } from '../models/size.model';
import { Supplier, SupplierInput } from '../models/supplier.model';
import { ListQuery, PagedResult } from './api.types';

/**
 * Contract every backend implementation must fulfil for a master resource.
 * Implemented by the REST API client (./http) and the in-browser mock (./mock);
 * `provideDataSource()` in app.config.ts selects one.
 */
export interface CrudDataSource<T extends BaseEntity, TInput, TItem extends BaseEntity = T> {
  list(query: ListQuery): Observable<PagedResult<TItem>>;
  /** All rows (list-row shape — products have `variantCount` but no variants). */
  getAll(options?: { status?: EntityStatus }): Observable<TItem[]>;
  getById(id: string): Observable<T>;
  create(input: TInput): Observable<T>;
  update(id: string, input: TInput): Observable<T>;
  setStatus(id: string, status: EntityStatus): Observable<T>;
  remove(id: string): Observable<void>;
  /** True when another record already uses `value` for `field` (case-insensitive). */
  isTaken(field: string, value: string, excludeId?: string): Observable<boolean>;
}

interface Resource<T extends BaseEntity, TInput, TItem extends BaseEntity = T> {
  entity: T;
  input: TInput;
  item: TItem;
}

/** Registry of all master resources and their payload types. */
export interface ResourceMap {
  categories: Resource<Category, CategoryInput>;
  brands: Resource<Brand, BrandInput>;
  sizes: Resource<Size, SizeInput>;
  colors: Resource<Color, ColorInput>;
  suppliers: Resource<Supplier, SupplierInput>;
  customers: Resource<Customer, CustomerInput>;
  products: Resource<Product, ProductInput, ProductListItem>;
}

export type ResourceName = keyof ResourceMap;
export type EntityOf<K extends ResourceName> = ResourceMap[K]['entity'];
export type InputOf<K extends ResourceName> = ResourceMap[K]['input'];
export type ItemOf<K extends ResourceName> = ResourceMap[K]['item'];
export type DataSourceOf<K extends ResourceName> = CrudDataSource<
  EntityOf<K>,
  InputOf<K>,
  ItemOf<K>
>;

export interface DataSourceFactory {
  create<K extends ResourceName>(resource: K): DataSourceOf<K>;
}

/** Provided by `provideDataSource()` (see ./provide-data-source.ts). */
export const DATA_SOURCE_FACTORY = new InjectionToken<DataSourceFactory>('DATA_SOURCE_FACTORY');

/** 'api' = REST backend; 'mock' = in-browser demo data (no backend needed). */
export type DataSourceMode = 'api' | 'mock';
export const DATA_SOURCE_MODE = new InjectionToken<DataSourceMode>('DATA_SOURCE_MODE');

/** Base URL of the REST API, e.g. '/api/v1' (proxied to the backend by the dev server). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

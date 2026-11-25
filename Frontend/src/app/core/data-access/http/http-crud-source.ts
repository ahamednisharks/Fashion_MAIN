import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

import { EntityStatus } from '../../models/base.model';
import { ListQuery, PagedResult } from '../api.types';
import { DataSourceOf, EntityOf, InputOf, ItemOf, ResourceName } from '../data-source';
import { fromHttpError, unwrapEnvelope } from './http-errors';

/** Success envelope returned by the backend. */
interface Envelope<T> {
  success: true;
  data: T;
}

/** How a resource is exposed by the REST API. */
export interface HttpResourceConfig<K extends ResourceName> {
  /** Path under the API base URL, e.g. '/categories'. */
  readonly path: string;
  /** Adjusts a record returned by the API to the frontend model (defaults to identity). */
  readonly toEntity?: (row: EntityOf<K>) => EntityOf<K>;
  /** Adjusts a list / lookup row returned by the API (defaults to identity). */
  readonly toItem?: (row: ItemOf<K>) => ItemOf<K>;
}

/**
 * CrudDataSource backed by the REST API.
 *   list      GET    {path}?search&status&page&pageSize&sortBy&sortOrder&<filters>
 *   getAll    GET    {path}/lookup?status
 *   isTaken   GET    {path}/exists?field&value&excludeId
 *   getById   GET    {path}/{id}
 *   create    POST   {path}
 *   update    PUT    {path}/{id}
 *   setStatus PATCH  {path}/{id}/status
 *   remove    DELETE {path}/{id}
 */
export class HttpCrudSource<K extends ResourceName> implements DataSourceOf<K> {
  private readonly toEntity: (row: EntityOf<K>) => EntityOf<K>;
  private readonly toItem: (row: ItemOf<K>) => ItemOf<K>;

  constructor(
    private readonly http: HttpClient,
    private readonly url: string,
    config: HttpResourceConfig<K>,
  ) {
    this.toEntity = config.toEntity ?? ((row) => row);
    this.toItem = config.toItem ?? ((row) => row);
  }

  list(query: ListQuery): Observable<PagedResult<ItemOf<K>>> {
    return this.call(
      this.http.get<Envelope<PagedResult<ItemOf<K>>>>(this.url, { params: listParams(query) }),
    ).pipe(
      map((page) => ({
        items: page.items.map(this.toItem),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      })),
    );
  }

  getAll(options?: { status?: EntityStatus }): Observable<ItemOf<K>[]> {
    let params = new HttpParams();
    if (options?.status) {
      params = params.set('status', options.status);
    }
    return this.call(this.http.get<Envelope<ItemOf<K>[]>>(`${this.url}/lookup`, { params })).pipe(
      map((rows) => rows.map(this.toItem)),
    );
  }

  getById(id: string): Observable<EntityOf<K>> {
    return this.call(this.http.get<Envelope<EntityOf<K>>>(this.itemUrl(id))).pipe(
      map(this.toEntity),
    );
  }

  create(input: InputOf<K>): Observable<EntityOf<K>> {
    return this.call(this.http.post<Envelope<EntityOf<K>>>(this.url, input)).pipe(
      map(this.toEntity),
    );
  }

  update(id: string, input: InputOf<K>): Observable<EntityOf<K>> {
    return this.call(this.http.put<Envelope<EntityOf<K>>>(this.itemUrl(id), input)).pipe(
      map(this.toEntity),
    );
  }

  setStatus(id: string, status: EntityStatus): Observable<EntityOf<K>> {
    return this.call(
      this.http.patch<Envelope<EntityOf<K>>>(`${this.itemUrl(id)}/status`, { status }),
    ).pipe(map(this.toEntity));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.itemUrl(id)).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }

  isTaken(field: string, value: string, excludeId?: string): Observable<boolean> {
    let params = new HttpParams().set('field', field).set('value', value);
    if (excludeId) {
      params = params.set('excludeId', excludeId);
    }
    return this.call(
      this.http.get<Envelope<{ exists: boolean }>>(`${this.url}/exists`, { params }),
    ).pipe(map((result) => result.exists));
  }

  private itemUrl(id: string): string {
    return `${this.url}/${encodeURIComponent(id)}`;
  }

  /** Unwraps the success envelope and converts failures to ApiError. */
  private call<T>(request: Observable<Envelope<T>>): Observable<T> {
    return request.pipe(
      map((response) => unwrapEnvelope<T>(response)),
      catchError((error: unknown) => throwError(() => fromHttpError(error))),
    );
  }
}

/** ListQuery → API query string (empty values omitted). */
export function listParams(query: ListQuery): HttpParams {
  let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
  if (query.search) {
    params = params.set('search', query.search);
  }
  if (query.status) {
    params = params.set('status', query.status);
  }
  if (query.sort) {
    params = params.set('sortBy', query.sort.field).set('sortOrder', query.sort.direction);
  }
  for (const [key, value] of Object.entries(query.filters)) {
    if (value) {
      params = params.set(key, value);
    }
  }
  return params;
}

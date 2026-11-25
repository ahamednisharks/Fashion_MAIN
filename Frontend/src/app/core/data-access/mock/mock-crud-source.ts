import { Observable } from 'rxjs';

import { EntityMeta, EntityStatus } from '../../models/base.model';
import { generateId } from '../../utils/id';
import { cleanText, compareValues, fieldValue, normalizeKey } from '../../utils/text';
import { ApiError, ListQuery, PagedResult } from '../api.types';
import { DataSourceOf, EntityOf, InputOf, ItemOf, ResourceName } from '../data-source';
import { MockDb } from './mock-db';

export interface UniqueRule<T> {
  readonly field: keyof T & string;
  /** Human label used in the error message, e.g. "Category name". */
  readonly label: string;
}

/** Server-side behaviour of a resource, emulated by the mock. */
export interface MockResourceConfig<K extends ResourceName> {
  /** Lower-case singular noun used in messages, e.g. "category". */
  readonly noun: string;
  /** Builds the stored record from the request payload (normalisation happens here, like a server). */
  toRecord(input: InputOf<K>, meta: EntityMeta): EntityOf<K>;
  /** Adds joined display fields for list rows. */
  toListItem(row: EntityOf<K>, db: MockDb): ItemOf<K>;
  /** Text that free-text search is matched against. */
  searchText(item: ItemOf<K>): string;
  /** Default ordering when the client does not request a sort. */
  defaultSort(a: EntityOf<K>, b: EntityOf<K>): number;
  /** Case-insensitive unique fields (empty values are ignored). */
  readonly unique?: readonly UniqueRule<EntityOf<K>>[];
  /** Extra integrity checks. Return an ApiError to reject the write. */
  validate?(record: EntityOf<K>, others: readonly EntityOf<K>[], db: MockDb): ApiError | null;
  /** Returns a message when the record is referenced elsewhere and cannot be deleted. */
  usage?(id: string, db: MockDb): string | null;
}

const MAX_PAGE_SIZE = 100;

/** Generic CRUD implementation backed by MockDb. */
export class MockCrudSource<K extends ResourceName> implements DataSourceOf<K> {
  constructor(
    private readonly db: MockDb,
    private readonly resource: K,
    private readonly config: MockResourceConfig<K>,
  ) {}

  list(query: ListQuery): Observable<PagedResult<ItemOf<K>>> {
    return this.db.request(() => {
      const tokens = normalizeKey(query.search).split(' ').filter(Boolean);
      const filters = Object.entries(query.filters).filter(([, value]) => value !== '');
      const sort = query.sort;

      const items = [...this.rows()]
        .sort((a, b) => this.config.defaultSort(a, b))
        .map((row) => this.config.toListItem(row, this.db))
        .filter(
          (item) =>
            (!query.status || item.status === query.status) &&
            filters.every(([key, value]) => String(fieldValue(item, key) ?? '') === value) &&
            (tokens.length === 0 || this.matches(item, tokens)),
        );

      if (sort) {
        const factor = sort.direction === 'asc' ? 1 : -1;
        items.sort(
          (a, b) => factor * compareValues(fieldValue(a, sort.field), fieldValue(b, sort.field)),
        );
      }

      const pageSize = Math.min(Math.max(1, Math.floor(query.pageSize)), MAX_PAGE_SIZE);
      const page = Math.max(1, Math.floor(query.page));
      const start = (page - 1) * pageSize;
      return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
    });
  }

  getAll(options?: { status?: EntityStatus }): Observable<ItemOf<K>[]> {
    return this.db.request(() =>
      this.rows()
        .filter((row) => !options?.status || row.status === options.status)
        .sort((a, b) => this.config.defaultSort(a, b))
        .map((row) => this.config.toListItem(row, this.db)),
    );
  }

  getById(id: string): Observable<EntityOf<K>> {
    return this.db.request(() => this.find(id));
  }

  create(input: InputOf<K>): Observable<EntityOf<K>> {
    return this.db.request(() => {
      const now = new Date().toISOString();
      const rows = this.rows();
      const record = this.config.toRecord(input, {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      });
      this.assertValid(record, rows);
      this.db.save(this.resource, [...rows, record]);
      return record;
    });
  }

  update(id: string, input: InputOf<K>): Observable<EntityOf<K>> {
    return this.db.request(() => {
      const existing = this.find(id);
      const rows = this.rows();
      const record = this.config.toRecord(input, {
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      this.assertValid(
        record,
        rows.filter((row) => row.id !== id),
      );
      this.db.save(
        this.resource,
        rows.map((row) => (row.id === id ? record : row)),
      );
      return record;
    });
  }

  setStatus(id: string, status: EntityStatus): Observable<EntityOf<K>> {
    return this.db.request(() => {
      const record = { ...this.find(id), status, updatedAt: new Date().toISOString() };
      this.db.save(
        this.resource,
        this.rows().map((row) => (row.id === id ? record : row)),
      );
      return record;
    });
  }

  remove(id: string): Observable<void> {
    return this.db.request(() => {
      this.find(id);
      const usage = this.config.usage?.(id, this.db);
      if (usage) {
        throw new ApiError('IN_USE', usage);
      }
      this.db.save(
        this.resource,
        this.rows().filter((row) => row.id !== id),
      );
    });
  }

  isTaken(field: string, value: string, excludeId?: string): Observable<boolean> {
    return this.db.request(() => {
      const key = normalizeKey(value);
      return (
        key !== '' &&
        this.rows().some(
          (row) => row.id !== excludeId && normalizeKey(fieldValue(row, field)) === key,
        )
      );
    });
  }

  private rows(): EntityOf<K>[] {
    return this.db.table(this.resource);
  }

  private find(id: string): EntityOf<K> {
    const row = this.rows().find((candidate) => candidate.id === id);
    if (!row) {
      throw new ApiError(
        'NOT_FOUND',
        `This ${this.config.noun} no longer exists. It may have been deleted.`,
      );
    }
    return row;
  }

  private matches(item: ItemOf<K>, tokens: readonly string[]): boolean {
    const haystack = normalizeKey(this.config.searchText(item));
    return tokens.every((token) => haystack.includes(token));
  }

  private assertValid(record: EntityOf<K>, others: readonly EntityOf<K>[]): void {
    for (const rule of this.config.unique ?? []) {
      const key = normalizeKey(record[rule.field]);
      if (key && others.some((other) => normalizeKey(other[rule.field]) === key)) {
        throw new ApiError(
          'DUPLICATE',
          `${rule.label} "${cleanText(String(record[rule.field]))}" already exists.`,
          rule.field,
        );
      }
    }
    const error = this.config.validate?.(record, others, this.db);
    if (error) {
      throw error;
    }
  }
}

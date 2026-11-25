import type { QueryResultRow } from 'pg';

import { type Queryable, pool } from '../../config/database.js';
import type { EntityStatus } from '../validators/fields.js';
import type { BaseListQuery } from '../validators/list-query.js';
import { type Paged, offsetOf, toPaged } from '../utils/pagination.js';
import { orderByClause } from '../utils/sorting.js';
import { SqlParams, searchConditions, whereClause } from '../utils/sql.js';

/**
 * Static description of a master table. All values are developer-defined constants
 * (never user input), so they are safe to place in SQL text; user values are always bound.
 */
export interface MasterTable {
  readonly table: string;
  readonly alias: string;
  /** SELECT list with camelCase aliases, e.g. `c.id, c.created_at AS "createdAt"`. */
  readonly columns: string;
  /** Boolean SQL for one search word bound to `placeholder` ('%word%'). */
  readonly searchSql: (placeholder: string) => string;
  /** Allowlisted sort fields: API name → SQL expression. */
  readonly sortable: Readonly<Record<string, string>>;
  readonly defaultOrder: string;
  /** Exact-match filters: query parameter → SQL column. */
  readonly filters?: Readonly<Record<string, string>>;
  /** Fields checkable via /exists: API name → SQL expression compared case-insensitively. */
  readonly uniqueFields: Readonly<Record<string, string>>;
}

function valueOf(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

/**
 * Shared read / status / delete queries for a table with `id` and `status` columns
 * (search, filters, allowlisted sorting and pagination).
 */
export abstract class TableRepository<TEntity extends QueryResultRow> {
  protected constructor(
    protected readonly t: MasterTable,
    protected readonly db: Queryable = pool,
  ) {}

  async list(query: BaseListQuery): Promise<Paged<TEntity>> {
    const { t } = this;
    const params = new SqlParams();
    const conditions = searchConditions(params, query.search, t.searchSql);
    if (query.status) {
      conditions.push(`${t.alias}.status = ${params.add(query.status)}`);
    }
    for (const [key, column] of Object.entries(t.filters ?? {})) {
      const value = valueOf(query, key);
      if (value !== undefined) {
        conditions.push(`${column} = ${params.add(value)}`);
      }
    }
    const from = `FROM ${t.table} ${t.alias} ${whereClause(conditions)}`;

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total ${from}`,
      params.values,
    );
    const order = orderByClause({
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      sortable: t.sortable,
      defaultOrder: t.defaultOrder,
      tiebreaker: `${t.alias}.id`,
    });
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<TEntity>(
      `SELECT ${t.columns} ${from} ${order} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }

  /** All rows (optionally by status) in default order — for dropdowns and lookups. */
  async findAll(status?: EntityStatus): Promise<TEntity[]> {
    const { t } = this;
    const params = new SqlParams();
    const where = status ? `WHERE ${t.alias}.status = ${params.add(status)}` : '';
    const result = await this.db.query<TEntity>(
      `SELECT ${t.columns} FROM ${t.table} ${t.alias} ${where} ORDER BY ${t.defaultOrder}, ${t.alias}.id`,
      params.values,
    );
    return result.rows;
  }

  async findById(id: string): Promise<TEntity | null> {
    const { t } = this;
    const result = await this.db.query<TEntity>(
      `SELECT ${t.columns} FROM ${t.table} ${t.alias} WHERE ${t.alias}.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async setStatus(id: string, status: EntityStatus): Promise<TEntity | null> {
    const { t } = this;
    const result = await this.db.query<TEntity>(
      `UPDATE ${t.table} AS ${t.alias} SET status = $1 WHERE ${t.alias}.id = $2 RETURNING ${t.columns}`,
      [status, id],
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM ${this.t.table} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /** True when another row already has `value` for `field` (case-insensitive). */
  async isTaken(field: string, value: string, excludeId?: string): Promise<boolean> {
    const { t } = this;
    const expression = t.uniqueFields[field];
    if (!expression) {
      return false;
    }
    const result = await this.db.query(
      `SELECT 1 FROM ${t.table} ${t.alias}
        WHERE lower(${expression}) = lower($1) AND ($2::uuid IS NULL OR ${t.alias}.id <> $2::uuid)
        LIMIT 1`,
      [value, excludeId ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/** Master tables: shared queries plus explicit INSERT / UPDATE statements in each subclass. */
export abstract class MasterRepository<
  TEntity extends QueryResultRow,
  TInput,
> extends TableRepository<TEntity> {
  abstract create(input: TInput): Promise<TEntity>;
  abstract update(id: string, input: TInput): Promise<TEntity | null>;
}

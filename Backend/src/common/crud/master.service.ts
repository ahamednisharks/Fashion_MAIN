import type { QueryResultRow } from 'pg';

import { AppError } from '../errors/app-error.js';
import type { Paged } from '../utils/pagination.js';
import type { EntityStatus } from '../validators/fields.js';
import type { BaseListQuery } from '../validators/list-query.js';
import type { MasterRepository } from './master.repository.js';

/**
 * Business rules shared by master modules. Uniqueness is enforced by database constraints
 * (translated to 409 DUPLICATE); modules override `assertDeletable` for "in use" checks.
 */
export class MasterService<TEntity extends QueryResultRow, TInput, TQuery extends BaseListQuery> {
  constructor(
    protected readonly repository: MasterRepository<TEntity, TInput>,
    /** Capitalised singular label, e.g. "Category". */
    protected readonly label: string,
  ) {}

  list(query: TQuery): Promise<Paged<TEntity>> {
    return this.repository.list(query);
  }

  lookup(status?: EntityStatus): Promise<TEntity[]> {
    return this.repository.findAll(status);
  }

  async get(id: string): Promise<TEntity> {
    return (await this.repository.findById(id)) ?? this.throwNotFound();
  }

  create(input: TInput): Promise<TEntity> {
    return this.repository.create(input);
  }

  async update(id: string, input: TInput): Promise<TEntity> {
    return (await this.repository.update(id, input)) ?? this.throwNotFound();
  }

  async setStatus(id: string, status: EntityStatus): Promise<TEntity> {
    return (await this.repository.setStatus(id, status)) ?? this.throwNotFound();
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.assertDeletable(id);
    if (!(await this.repository.delete(id))) {
      this.throwNotFound();
    }
  }

  isTaken(field: string, value: string, excludeId?: string): Promise<boolean> {
    return this.repository.isTaken(field, value, excludeId);
  }

  /** Throw AppError.inUse(...) when the record is referenced elsewhere. */
  protected async assertDeletable(_id: string): Promise<void> {}

  protected throwNotFound(): never {
    throw AppError.notFound(`${this.label} not found.`);
  }
}

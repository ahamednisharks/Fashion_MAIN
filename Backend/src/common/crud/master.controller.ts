import type { QueryResultRow } from 'pg';

import type { IdParams, LookupQuery, StatusBody, BaseListQuery } from '../validators/list-query.js';
import type { MasterService } from './master.service.js';

export interface ExistsQuery {
  field: string;
  value: string;
  excludeId?: string;
}

/** Translates validated HTTP input into service calls for a master resource. */
export class MasterController<
  TEntity extends QueryResultRow,
  TInput,
  TQuery extends BaseListQuery,
> {
  constructor(private readonly service: MasterService<TEntity, TInput, TQuery>) {}

  readonly list = (query: TQuery) => this.service.list(query);

  readonly lookup = (query: LookupQuery) => this.service.lookup(query.status);

  readonly exists = async (query: ExistsQuery) => ({
    exists: await this.service.isTaken(query.field, query.value, query.excludeId),
  });

  readonly getById = (params: IdParams) => this.service.get(params.id);

  readonly create = (body: TInput) => this.service.create(body);

  readonly update = (params: IdParams, body: TInput) => this.service.update(params.id, body);

  readonly setStatus = (params: IdParams, body: StatusBody) =>
    this.service.setStatus(params.id, body.status);

  readonly remove = (params: IdParams): Promise<void> => this.service.remove(params.id);
}

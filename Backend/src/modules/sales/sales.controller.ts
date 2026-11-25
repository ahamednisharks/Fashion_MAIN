import type { Response } from 'express';

import type { IdParams } from '../../common/validators/list-query.js';
import { currentAuth } from '../auth/auth.middleware.js';
import type {
  InvoiceInput,
  InvoiceListQuery,
  ItemLookupQuery,
  ItemSearchQuery,
} from './sales.schema.js';
import { salesService } from './sales.service.js';

/** HTTP → service mapping for /sales (the billing user comes from the session). */
export class SalesController {
  constructor(private readonly service = salesService) {}

  readonly lookupItems = (query: ItemLookupQuery) => this.service.lookupItems(query);

  readonly searchItems = (query: ItemSearchQuery) => this.service.searchItems(query);

  readonly listInvoices = (query: InvoiceListQuery) => this.service.list(query);

  readonly getInvoice = (params: IdParams) => this.service.get(params.id);

  readonly createInvoice = (body: InvoiceInput, res: Response) => {
    const { user } = currentAuth(res);
    return this.service.create(body, { id: user.id, fullName: user.fullName });
  };
}

export const salesController = new SalesController();

import { MasterService } from '../../common/crud/master.service.js';
import { CustomersRepository } from './customers.repository.js';
import type { Customer, CustomerInput, CustomerListQuery } from './customers.schema.js';

/**
 * Customers are not referenced by other tables yet. When billing is added, override
 * `assertDeletable` so customers with bills can only be deactivated.
 */
export class CustomersService extends MasterService<Customer, CustomerInput, CustomerListQuery> {
  constructor(customers = new CustomersRepository()) {
    super(customers, 'Customer');
  }
}

export const customersService = new CustomersService();

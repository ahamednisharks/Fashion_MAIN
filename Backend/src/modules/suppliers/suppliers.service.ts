import { MasterService } from '../../common/crud/master.service.js';
import { SuppliersRepository } from './suppliers.repository.js';
import type { Supplier, SupplierInput, SupplierListQuery } from './suppliers.schema.js';

/**
 * Suppliers on purchase orders / entries cannot be deleted: RESTRICT foreign keys answer
 * 409 IN_USE (deactivate instead).
 */
export class SuppliersService extends MasterService<Supplier, SupplierInput, SupplierListQuery> {
  constructor(suppliers = new SuppliersRepository()) {
    super(suppliers, 'Supplier');
  }
}

export const suppliersService = new SuppliersService();

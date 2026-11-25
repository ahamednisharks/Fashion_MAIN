import { createMasterModule } from '../../common/crud/master.routes.js';
import { suppliersController } from './suppliers.controller.js';
import {
  supplierExistsQuerySchema,
  supplierInputSchema,
  supplierListQuerySchema,
  supplierSchema,
} from './suppliers.schema.js';

export const suppliersModule = createMasterModule({
  basePath: '/suppliers',
  tag: 'Suppliers',
  description:
    'Vendors and wholesalers. Search matches name, contact person, mobile, email, city and GST number.',
  noun: 'supplier',
  plural: 'suppliers',
  controller: suppliersController,
  entitySchema: supplierSchema,
  inputSchema: supplierInputSchema,
  listQuerySchema: supplierListQuerySchema,
  existsQuerySchema: supplierExistsQuerySchema,
});

import { createMasterModule } from '../../common/crud/master.routes.js';
import { customersController } from './customers.controller.js';
import {
  customerExistsQuerySchema,
  customerInputSchema,
  customerListQuerySchema,
  customerSchema,
} from './customers.schema.js';

export const customersModule = createMasterModule({
  basePath: '/customers',
  tag: 'Customers',
  description:
    'Retail and business customers. Mobile number is unique; GST number is optional. ' +
    'Search matches name, mobile, email, city and GST number.',
  noun: 'customer',
  plural: 'customers',
  controller: customersController,
  entitySchema: customerSchema,
  inputSchema: customerInputSchema,
  listQuerySchema: customerListQuerySchema,
  existsQuerySchema: customerExistsQuerySchema,
});

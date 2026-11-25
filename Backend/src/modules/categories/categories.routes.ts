import { createMasterModule } from '../../common/crud/master.routes.js';
import { categoriesController } from './categories.controller.js';
import {
  categoryExistsQuerySchema,
  categoryInputSchema,
  categoryListQuerySchema,
  categorySchema,
} from './categories.schema.js';

export const categoriesModule = createMasterModule({
  basePath: '/categories',
  tag: 'Categories',
  description: 'Product categories such as Shirts, Kurtis or Sarees.',
  noun: 'category',
  plural: 'categories',
  controller: categoriesController,
  entitySchema: categorySchema,
  inputSchema: categoryInputSchema,
  listQuerySchema: categoryListQuerySchema,
  existsQuerySchema: categoryExistsQuerySchema,
});

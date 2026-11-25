import { createMasterModule } from '../../common/crud/master.routes.js';
import { brandsController } from './brands.controller.js';
import {
  brandExistsQuerySchema,
  brandInputSchema,
  brandListQuerySchema,
  brandSchema,
} from './brands.schema.js';

export const brandsModule = createMasterModule({
  basePath: '/brands',
  tag: 'Brands',
  description: 'Brands and labels you stock, including your in-house label.',
  noun: 'brand',
  plural: 'brands',
  controller: brandsController,
  entitySchema: brandSchema,
  inputSchema: brandInputSchema,
  listQuerySchema: brandListQuerySchema,
  existsQuerySchema: brandExistsQuerySchema,
});

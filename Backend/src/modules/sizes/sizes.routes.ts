import { createMasterModule } from '../../common/crud/master.routes.js';
import { sizesController } from './sizes.controller.js';
import {
  sizeExistsQuerySchema,
  sizeInputSchema,
  sizeListQuerySchema,
  sizeSchema,
} from './sizes.schema.js';

export const sizesModule = createMasterModule({
  basePath: '/sizes',
  tag: 'Sizes',
  description:
    'Sizes used by product variants: clothing (S, M, L…), numeric (28, 30…) or custom (Free Size, 2-3 Y…). ' +
    'Default order is the natural size order.',
  noun: 'size',
  plural: 'sizes',
  controller: sizesController,
  entitySchema: sizeSchema,
  inputSchema: sizeInputSchema,
  listQuerySchema: sizeListQuerySchema,
  existsQuerySchema: sizeExistsQuerySchema,
});

import { createMasterModule } from '../../common/crud/master.routes.js';
import { colorsController } from './colors.controller.js';
import {
  colorExistsQuerySchema,
  colorInputSchema,
  colorListQuerySchema,
  colorSchema,
} from './colors.schema.js';

export const colorsModule = createMasterModule({
  basePath: '/colors',
  tag: 'Colors',
  description: 'Colours used by product variants, with a HEX code for swatches.',
  noun: 'colour',
  plural: 'colours',
  controller: colorsController,
  entitySchema: colorSchema,
  inputSchema: colorInputSchema,
  listQuerySchema: colorListQuerySchema,
  existsQuerySchema: colorExistsQuerySchema,
});

import { MasterController } from '../../common/crud/master.controller.js';
import { sizesService } from './sizes.service.js';

export const sizesController = new MasterController(sizesService);

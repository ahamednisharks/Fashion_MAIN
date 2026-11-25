import { MasterController } from '../../common/crud/master.controller.js';
import { brandsService } from './brands.service.js';

export const brandsController = new MasterController(brandsService);

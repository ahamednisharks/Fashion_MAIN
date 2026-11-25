import { MasterController } from '../../common/crud/master.controller.js';
import { suppliersService } from './suppliers.service.js';

export const suppliersController = new MasterController(suppliersService);

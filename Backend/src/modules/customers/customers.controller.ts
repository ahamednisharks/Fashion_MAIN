import { MasterController } from '../../common/crud/master.controller.js';
import { customersService } from './customers.service.js';

export const customersController = new MasterController(customersService);

import { MasterController } from '../../common/crud/master.controller.js';
import { categoriesService } from './categories.service.js';

export const categoriesController = new MasterController(categoriesService);

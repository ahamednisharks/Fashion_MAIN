import { MasterController } from '../../common/crud/master.controller.js';
import { colorsService } from './colors.service.js';

export const colorsController = new MasterController(colorsService);

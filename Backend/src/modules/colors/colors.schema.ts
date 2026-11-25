import { z } from 'zod';

import {
  hexColorField,
  optionalText,
  requiredText,
  statusEnum,
  statusField,
} from '../../common/validators/fields.js';
import {
  createExistsQuerySchema,
  createListQuerySchema,
} from '../../common/validators/list-query.js';

export const colorSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    hexCode: z.string().describe('Uppercase 6-digit HEX code, e.g. #1F2A5A.'),
    description: z.string(),
    status: statusEnum,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Color' });
export type Color = z.infer<typeof colorSchema>;

export const colorInputSchema = z
  .object({
    name: requiredText('Color name', 40),
    hexCode: hexColorField.describe('Accepts #abc, abc or #aabbcc; stored as #AABBCC.'),
    description: optionalText('Description', 250),
    status: statusField,
  })
  .meta({ id: 'ColorInput' });
export type ColorInput = z.infer<typeof colorInputSchema>;

export const colorListQuerySchema = createListQuerySchema(
  ['name', 'hexCode', 'status', 'createdAt', 'updatedAt'],
  {},
);
export type ColorListQuery = z.infer<typeof colorListQuerySchema>;

export const colorExistsQuerySchema = createExistsQuerySchema(['name']);

import { z } from 'zod';

import {
  optionalText,
  requiredText,
  statusEnum,
  statusField,
} from '../../common/validators/fields.js';
import {
  createExistsQuerySchema,
  createListQuerySchema,
} from '../../common/validators/list-query.js';

export const brandSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    status: statusEnum,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Brand' });
export type Brand = z.infer<typeof brandSchema>;

export const brandInputSchema = z
  .object({
    name: requiredText('Brand name', 60),
    description: optionalText('Description', 250),
    status: statusField,
  })
  .meta({ id: 'BrandInput' });
export type BrandInput = z.infer<typeof brandInputSchema>;

export const brandListQuerySchema = createListQuerySchema(
  ['name', 'status', 'createdAt', 'updatedAt'],
  {},
);
export type BrandListQuery = z.infer<typeof brandListQuerySchema>;

export const brandExistsQuerySchema = createExistsQuerySchema(['name']);

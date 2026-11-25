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

export const categorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    status: statusEnum,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Category' });
export type Category = z.infer<typeof categorySchema>;

export const categoryInputSchema = z
  .object({
    name: requiredText('Category name', 60),
    description: optionalText('Description', 250),
    status: statusField,
  })
  .meta({ id: 'CategoryInput' });
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryListQuerySchema = createListQuerySchema(
  ['name', 'status', 'createdAt', 'updatedAt'],
  {},
);
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

export const categoryExistsQuerySchema = createExistsQuerySchema(['name']);

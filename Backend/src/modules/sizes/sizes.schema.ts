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

export const SIZE_TYPES = ['clothing', 'numeric', 'custom'] as const;
export const sizeTypeEnum = z.enum(SIZE_TYPES, {
  error: "Size type must be 'clothing', 'numeric' or 'custom'.",
});

export const sizeSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: sizeTypeEnum,
    description: z.string(),
    status: statusEnum,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Size' });
export type Size = z.infer<typeof sizeSchema>;

export const sizeInputSchema = z
  .object({
    name: requiredText('Size name', 20).describe('e.g. M, XL, 32, Free Size, 2-3 Y'),
    type: sizeTypeEnum.default('clothing'),
    description: optionalText('Description', 250),
    status: statusField,
  })
  .meta({ id: 'SizeInput' });
export type SizeInput = z.infer<typeof sizeInputSchema>;

export const sizeListQuerySchema = createListQuerySchema(
  ['name', 'type', 'status', 'createdAt', 'updatedAt'],
  { type: sizeTypeEnum.optional().describe('Filter by size type.') },
);
export type SizeListQuery = z.infer<typeof sizeListQuerySchema>;

export const sizeExistsQuerySchema = createExistsQuerySchema(['name']);

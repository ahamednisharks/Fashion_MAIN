import { z } from 'zod';

import { uuidField } from '../../../common/validators/fields.js';

// Variant payload / response schemas live with the product schemas (a product payload embeds
// variants); they are re-exported here for the sub-resource.
export {
  type Variant,
  type VariantInput,
  variantInputSchema,
  variantSchema,
} from '../products.schema.js';

export const productParamsSchema = z.object({ productId: uuidField('Product ID') });
export type ProductParams = z.infer<typeof productParamsSchema>;

export const variantParamsSchema = z.object({
  productId: uuidField('Product ID'),
  variantId: uuidField('Variant ID'),
});
export type VariantParams = z.infer<typeof variantParamsSchema>;

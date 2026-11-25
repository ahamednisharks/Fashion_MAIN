import { z } from 'zod';

import {
  checkGstinMatchesState,
  emailField,
  gstinField,
  mobileField,
  moneyField,
  optionalText,
  pincodeField,
  requiredText,
  stateField,
  statusEnum,
  statusField,
} from '../../common/validators/fields.js';
import {
  createExistsQuerySchema,
  createListQuerySchema,
} from '../../common/validators/list-query.js';

export const customerSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    mobile: z.string(),
    email: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
    gstNumber: z.string().describe("GSTIN for business customers, or ''."),
    openingBalance: z
      .number()
      .describe('Amount receivable from the customer at account opening (INR).'),
    status: statusEnum,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Customer' });
export type Customer = z.infer<typeof customerSchema>;

export const customerInputSchema = z
  .object({
    name: requiredText('Customer name', 100),
    mobile: mobileField.describe('10-digit Indian mobile number; must be unique per customer.'),
    email: emailField,
    address: optionalText('Address', 250),
    city: optionalText('City', 60),
    state: stateField,
    pincode: pincodeField,
    gstNumber: gstinField.describe('Optional — only for business (B2B) customers.'),
    openingBalance: moneyField('Opening balance').default(0),
    status: statusField,
  })
  .superRefine(checkGstinMatchesState)
  .meta({ id: 'CustomerInput' });
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const customerListQuerySchema = createListQuerySchema(
  ['name', 'mobile', 'city', 'openingBalance', 'status', 'createdAt', 'updatedAt'],
  {},
);
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerExistsQuerySchema = createExistsQuerySchema(['mobile', 'gstNumber']);

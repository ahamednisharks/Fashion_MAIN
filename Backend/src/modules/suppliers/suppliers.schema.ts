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

export const supplierSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    contactPerson: z.string(),
    mobile: z.string(),
    email: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
    gstNumber: z.string().describe("15-character GSTIN, or '' when unregistered."),
    openingBalance: z.number().describe('Amount payable to the supplier at account opening (INR).'),
    status: statusEnum,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Supplier' });
export type Supplier = z.infer<typeof supplierSchema>;

export const supplierInputSchema = z
  .object({
    name: requiredText('Supplier name', 100),
    contactPerson: optionalText('Contact person', 60),
    mobile: mobileField.describe('10-digit Indian mobile number (+91 / 0 prefixes are accepted).'),
    email: emailField,
    address: optionalText('Address', 250),
    city: optionalText('City', 60),
    state: stateField.describe('Indian state / union territory name, or empty.'),
    pincode: pincodeField,
    gstNumber: gstinField.describe(
      'Optional GSTIN; format, state code and check digit are validated.',
    ),
    openingBalance: moneyField('Opening balance').default(0),
    status: statusField,
  })
  .superRefine(checkGstinMatchesState)
  .meta({ id: 'SupplierInput' });
export type SupplierInput = z.infer<typeof supplierInputSchema>;

export const supplierListQuerySchema = createListQuerySchema(
  ['name', 'city', 'state', 'openingBalance', 'status', 'createdAt', 'updatedAt'],
  { state: z.string().trim().max(60).optional().describe('Filter by state name.') },
);
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;

export const supplierExistsQuerySchema = createExistsQuerySchema(['name', 'gstNumber', 'mobile']);

import { BaseEntity, EntityInput, PostalAddress } from './base.model';

export interface Supplier extends BaseEntity, PostalAddress {
  name: string;
  contactPerson: string;
  mobile: string;
  email: string;
  /** Optional GSTIN (15 characters, uppercase). Empty string when unregistered. */
  gstNumber: string;
  /** Amount payable to the supplier when the account is opened (INR). */
  openingBalance: number;
}

export type SupplierInput = EntityInput<Supplier>;

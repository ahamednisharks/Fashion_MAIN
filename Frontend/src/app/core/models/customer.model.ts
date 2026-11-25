import { BaseEntity, EntityInput, PostalAddress } from './base.model';

export interface Customer extends BaseEntity, PostalAddress {
  name: string;
  mobile: string;
  email: string;
  /** Optional GSTIN for B2B customers. Empty string when not provided. */
  gstNumber: string;
  /** Amount receivable from the customer when the account is opened (INR). */
  openingBalance: number;
}

export type CustomerInput = EntityInput<Customer>;

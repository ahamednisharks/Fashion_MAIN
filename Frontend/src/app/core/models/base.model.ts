export type EntityStatus = 'active' | 'inactive';

export const STATUS_OPTIONS: readonly { value: EntityStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** Fields every master record has. Timestamps are ISO-8601 strings (as a JSON API returns them). */
export interface BaseEntity {
  id: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

/** Server-managed fields of a record. */
export type EntityMeta = Pick<BaseEntity, 'id' | 'createdAt' | 'updatedAt'>;

/** Payload accepted when creating / updating a record. */
export type EntityInput<T extends BaseEntity> = Omit<T, keyof EntityMeta>;

/** Postal address shared by suppliers, customers and the shop profile. */
export interface PostalAddress {
  address: string;
  city: string;
  state: string;
  pincode: string;
}

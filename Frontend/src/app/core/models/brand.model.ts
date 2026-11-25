import { BaseEntity, EntityInput } from './base.model';

export interface Brand extends BaseEntity {
  name: string;
  description: string;
}

export type BrandInput = EntityInput<Brand>;

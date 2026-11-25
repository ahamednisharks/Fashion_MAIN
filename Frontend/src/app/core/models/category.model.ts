import { BaseEntity, EntityInput } from './base.model';

export interface Category extends BaseEntity {
  name: string;
  description: string;
}

export type CategoryInput = EntityInput<Category>;

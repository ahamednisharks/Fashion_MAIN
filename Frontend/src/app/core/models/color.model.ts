import { BaseEntity, EntityInput } from './base.model';

export interface Color extends BaseEntity {
  name: string;
  /** Uppercase 6-digit HEX code including '#', e.g. #1F2A5A. */
  hexCode: string;
  description: string;
}

export type ColorInput = EntityInput<Color>;

import { BaseEntity, EntityInput } from './base.model';

export type SizeType = 'clothing' | 'numeric' | 'custom';

export const SIZE_TYPE_OPTIONS: readonly { value: SizeType; label: string }[] = [
  { value: 'clothing', label: 'Clothing' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'custom', label: 'Custom' },
];

export function sizeTypeLabel(type: SizeType): string {
  return SIZE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export interface Size extends BaseEntity {
  name: string;
  type: SizeType;
  description: string;
}

export type SizeInput = EntityInput<Size>;

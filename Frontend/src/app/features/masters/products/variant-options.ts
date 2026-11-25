import { SIZE_TYPE_OPTIONS, Size, SizeType } from '../../../core/models/size.model';

export interface SizeGroup {
  readonly type: SizeType;
  readonly label: string;
  readonly sizes: readonly Size[];
}

/** Groups sizes by type (Clothing / Numeric / Custom) for <optgroup>s and chip rows. */
export function groupSizes(sizes: readonly Size[]): SizeGroup[] {
  return SIZE_TYPE_OPTIONS.map((option) => ({
    type: option.value,
    label: option.label,
    sizes: sizes.filter((size) => size.type === option.value),
  })).filter((group) => group.sizes.length > 0);
}

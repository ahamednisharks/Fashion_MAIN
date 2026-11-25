import { Size, SizeType } from '../models/size.model';
import { compareValues } from './text';

const TYPE_ORDER: Record<SizeType, number> = { clothing: 0, numeric: 1, custom: 2 };

const CLOTHING_RANK: Readonly<Record<string, number>> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  '2XL': 6,
  XXXL: 7,
  '3XL': 7,
  '4XL': 8,
  '5XL': 9,
  '6XL': 10,
};

function clothingRank(name: string): number {
  return CLOTHING_RANK[name.replace(/\s+/g, '').toUpperCase()] ?? 99;
}

/**
 * Orders sizes the way staff expect to see them: clothing sizes S → XXL, numeric sizes ascending,
 * then custom sizes alphabetically.
 */
export function compareSizes(
  a: Pick<Size, 'name' | 'type'>,
  b: Pick<Size, 'name' | 'type'>,
): number {
  if (a.type !== b.type) {
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  }
  if (a.type === 'clothing') {
    const diff = clothingRank(a.name) - clothingRank(b.name);
    if (diff !== 0) {
      return diff;
    }
  }
  if (a.type === 'numeric') {
    const diff = parseFloat(a.name) - parseFloat(b.name);
    if (!Number.isNaN(diff) && diff !== 0) {
      return diff;
    }
  }
  return compareValues(a.name, b.name);
}

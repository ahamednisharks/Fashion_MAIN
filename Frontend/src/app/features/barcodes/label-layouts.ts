import { LabelLayoutId } from '../../core/models/item.model';

/** Everything printed on one price label. */
export interface LabelData {
  readonly barcode: string;
  readonly productName: string;
  /** "K-21 · M · Mustard" ('' for products without variants). */
  readonly details: string;
  readonly mrp: number;
  readonly price: number;
}

/** Label stock: sizes in millimetres. */
export interface LabelLayoutSpec {
  readonly id: LabelLayoutId;
  readonly name: string;
  readonly hint: string;
  readonly labelWidth: number;
  readonly labelHeight: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly columns: number;
  /** Labels on one page (a roll "page" is one row of labels). */
  readonly perPage: number;
  readonly marginTop: number;
  readonly marginLeft: number;
  readonly gapX: number;
  readonly gapY: number;
  /** Width of the narrowest barcode bar (mm). */
  readonly module: number;
  /** Smaller text for small labels. */
  readonly compact: boolean;
  /** A sheet can be started part-way (re-using a sheet with labels already peeled off). */
  readonly sheet: boolean;
}

export const LABEL_LAYOUTS: Readonly<Record<LabelLayoutId, LabelLayoutSpec>> = {
  'roll-50x25': {
    id: 'roll-50x25',
    name: '50 × 25 mm roll',
    hint: 'Thermal label printer, one label across.',
    labelWidth: 50,
    labelHeight: 25,
    pageWidth: 50,
    pageHeight: 25,
    columns: 1,
    perPage: 1,
    marginTop: 0,
    marginLeft: 0,
    gapX: 0,
    gapY: 0,
    module: 0.33,
    compact: false,
    sheet: false,
  },
  'roll-38x25-2': {
    id: 'roll-38x25-2',
    name: '38 × 25 mm roll, 2 across',
    hint: 'Thermal label printer with a two-across roll (2 mm gap).',
    labelWidth: 38,
    labelHeight: 25,
    pageWidth: 78,
    pageHeight: 25,
    columns: 2,
    perPage: 2,
    marginTop: 0,
    marginLeft: 0,
    gapX: 2,
    gapY: 0,
    module: 0.28,
    compact: true,
    sheet: false,
  },
  'a4-65': {
    id: 'a4-65',
    name: 'A4 sheet, 65 labels',
    hint: 'Ordinary printer, 5 × 13 sticker sheet (38.1 × 21.2 mm).',
    labelWidth: 38.1,
    labelHeight: 21.2,
    pageWidth: 210,
    pageHeight: 297,
    columns: 5,
    perPage: 65,
    marginTop: 10.7,
    marginLeft: 4.75,
    gapX: 2.5,
    gapY: 0,
    module: 0.28,
    compact: true,
    sheet: true,
  },
};

export const LABEL_LAYOUT_LIST: readonly LabelLayoutSpec[] = Object.values(LABEL_LAYOUTS);

/**
 * Splits labels into printed pages; `null` cells stay blank. On a sheet, printing starts at
 * label `startAt` (1-based) of the first page; rolls always start at the first label.
 */
export function paginateLabels(
  labels: readonly LabelData[],
  spec: LabelLayoutSpec,
  startAt = 1,
): (LabelData | null)[][] {
  if (!labels.length) {
    return [];
  }
  const skip = spec.sheet ? Math.min(Math.max(Math.trunc(startAt) || 1, 1), spec.perPage) - 1 : 0;
  const cells: (LabelData | null)[] = [...Array<null>(skip).fill(null), ...labels];
  const pages: (LabelData | null)[][] = [];
  for (let index = 0; index < cells.length; index += spec.perPage) {
    const page = cells.slice(index, index + spec.perPage);
    // A roll row is always full width; a sheet's last page is simply left short.
    while (!spec.sheet && page.length < spec.perPage) page.push(null);
    pages.push(page);
  }
  return pages;
}

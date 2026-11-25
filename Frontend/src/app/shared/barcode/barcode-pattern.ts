import { CODE128_QUIET_ZONE, canEncodeCode128, encodeCode128 } from './code128';
import { EAN13_QUIET_LEFT, EAN13_QUIET_RIGHT, encodeEan13, isValidEan13 } from './ean13';

export type Symbology = 'ean13' | 'code128';

/** One bar: where it starts and how wide it is, in modules (quiet zone included). */
export interface Bar {
  readonly x: number;
  readonly width: number;
}

export interface BarcodePattern {
  readonly symbology: Symbology;
  /** Total width in modules, quiet zones included. */
  readonly width: number;
  readonly bars: readonly Bar[];
}

/**
 * How a barcode is printed. Valid EAN-13 numbers (the shop's own 200… barcodes and most
 * makers' barcodes) print as EAN-13; anything else prints as Code 128, which encodes exactly
 * the stored text, so a scanner reads back what billing looks up. Null when it cannot be printed.
 */
export function barcodePattern(value: string): BarcodePattern | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  if (isValidEan13(text)) {
    return toPattern('ean13', encodeEan13(text), EAN13_QUIET_LEFT, EAN13_QUIET_RIGHT);
  }
  if (canEncodeCode128(text)) {
    return toPattern('code128', encodeCode128(text), CODE128_QUIET_ZONE, CODE128_QUIET_ZONE);
  }
  return null;
}

function toPattern(
  symbology: Symbology,
  modules: string,
  quietLeft: number,
  quietRight: number,
): BarcodePattern {
  const bars: Bar[] = [];
  let start = -1;
  for (let index = 0; index <= modules.length; index++) {
    const isBar = modules[index] === '1';
    if (isBar && start < 0) {
      start = index;
    } else if (!isBar && start >= 0) {
      bars.push({ x: quietLeft + start, width: index - start });
      start = -1;
    }
  }
  return { symbology, width: quietLeft + modules.length + quietRight, bars };
}

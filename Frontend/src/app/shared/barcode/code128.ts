/**
 * Code 128 bar patterns, for barcodes that are not EAN-13 numbers (e.g. a maker's alphanumeric
 * code). Digit-only text uses code set C (two digits per symbol, so labels stay narrow);
 * anything else uses code set B (printable ASCII).
 */

/**
 * Bar / space widths of symbols 0–106 (106 = stop, 7 elements). Each symbol is 11 modules wide
 * (the stop is 13), starting with a bar.
 */
// prettier-ignore
const WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const STOP = 106;

/** Blank modules required on each side of a Code 128 symbol. */
export const CODE128_QUIET_ZONE = 10;

/** Printable ASCII (space … DEL) — what code set B can carry. */
export function canEncodeCode128(text: string): boolean {
  return text.length > 0 && /^[\x20-\x7f]+$/.test(text);
}

/** Symbol values (start, data, check, stop) for `text`. */
export function code128Values(text: string): number[] {
  if (!canEncodeCode128(text)) {
    throw new Error(`Code 128 cannot encode "${text}".`);
  }
  const values: number[] = [];
  if (/^[0-9]{2,}$/.test(text)) {
    values.push(START_C);
    const pairs = Math.floor(text.length / 2) * 2;
    for (let index = 0; index < pairs; index += 2) {
      values.push(Number(text.slice(index, index + 2)));
    }
    if (pairs < text.length) {
      // Odd number of digits: the last one goes in code set B.
      values.push(CODE_B, text.charCodeAt(pairs) - 32);
    }
  } else {
    values.push(START_B);
    for (const char of text) {
      values.push(char.charCodeAt(0) - 32);
    }
  }
  const checksum = values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0);
  values.push(checksum % 103, STOP);
  return values;
}

/** Modules of the symbol ('1' = bar, '0' = space), without quiet zones. */
export function encodeCode128(text: string): string {
  let modules = '';
  for (const value of code128Values(text)) {
    [...WIDTHS[value]].forEach((width, element) => {
      modules += (element % 2 === 0 ? '1' : '0').repeat(Number(width));
    });
  }
  return modules;
}

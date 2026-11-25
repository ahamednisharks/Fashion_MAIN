import { fitWithin } from '../../shared/image/logo-image';
import { oklabToRgb, rgbToHex, rgbToOklab } from './theme-palette';

/** Most colours offered from one logo. */
export const MAX_LOGO_COLORS = 5;
/** The logo is shrunk to this many px (longest side) before its colours are counted. */
const SAMPLE_SIDE = 128;
/** Below this chroma a pixel is grey (black text, white paper, shadows). */
const GREY_CHROMA = 0.04;
/** A colour must cover this share of the logo to be offered (drops edge blends and specks). */
const MIN_SHARE = 0.03;
/** Dark greys / black must cover this share to be offered as a charcoal theme. */
const MIN_DARK_SHARE = 0.05;
/** Colours closer than this (OKLab distance) count as one. */
const MIN_DISTANCE = 0.09;

interface Tally {
  n: number;
  l: number;
  a: number;
  b: number;
}

/**
 * The logo's main colours as '#RRGGBB', most prominent (and most colourful) first. White and
 * transparent pixels are background; black / dark grey is offered last, and only when the logo
 * uses a fair amount of it. `data` is RGBA, row by row (as in ImageData).
 */
export function pickLogoColors(data: Uint8ClampedArray, max = MAX_LOGO_COLORS): string[] {
  const groups = new Map<number, Tally>();
  const dark: Tally = { n: 0, l: 0, a: 0, b: 0 };
  let counted = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 128) {
      continue; // transparent background
    }
    const lab = rgbToOklab([data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255]);
    const chroma = Math.hypot(lab.a, lab.b);
    if (chroma < GREY_CHROMA) {
      if (lab.l > 0.93) {
        continue; // white paper
      }
      counted++;
      if (lab.l < 0.55) {
        add(dark, lab);
      }
      continue;
    }
    counted++;
    // Group by hue (20° steps) and lightness (5 bands): shades of one ink fall together.
    const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360;
    const key = (Math.round(hue / 20) % 18) * 10 + Math.min(4, Math.floor(lab.l * 5));
    let group = groups.get(key);
    if (!group) {
      group = { n: 0, l: 0, a: 0, b: 0 };
      groups.set(key, group);
    }
    add(group, lab);
  }

  const picked: Tally[] = [];
  const candidates = [...groups.values()]
    .filter((group) => group.n >= Math.max(4, counted * MIN_SHARE))
    .map(mean)
    .sort((x, y) => score(y) - score(x));
  for (const candidate of candidates) {
    if (
      picked.length < max &&
      picked.every((other) => distance(other, candidate) >= MIN_DISTANCE)
    ) {
      picked.push(candidate);
    }
  }
  if (picked.length < max && dark.n >= Math.max(4, counted * MIN_DARK_SHARE)) {
    picked.push(mean(dark));
  }
  return picked.map((tally) => rgbToHex(oklabToRgb(tally)));
}

/** Reads a logo (image data URL) and returns its main colours — see pickLogoColors(). */
export async function logoColors(dataUrl: string, max = MAX_LOGO_COLORS): Promise<string[]> {
  if (!dataUrl) {
    return [];
  }
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const size = fitWithin(
    { width: image.naturalWidth || SAMPLE_SIDE, height: image.naturalHeight || SAMPLE_SIDE },
    SAMPLE_SIDE,
  );
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return [];
  }
  context.drawImage(image, 0, 0, size.width, size.height);
  return pickLogoColors(context.getImageData(0, 0, size.width, size.height).data, max);
}

function add(tally: Tally, lab: { l: number; a: number; b: number }): void {
  tally.n++;
  tally.l += lab.l;
  tally.a += lab.a;
  tally.b += lab.b;
}

function mean(tally: Tally): Tally {
  return { n: tally.n, l: tally.l / tally.n, a: tally.a / tally.n, b: tally.b / tally.n };
}

/** Bigger areas first, with a bonus for vivid colours (brand inks over beige or skin tones). */
function score(tally: Tally): number {
  return tally.n * (0.4 + (0.6 * Math.min(Math.hypot(tally.a, tally.b), 0.15)) / 0.15);
}

function distance(x: Tally, y: Tally): number {
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

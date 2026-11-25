/**
 * Colour maths for the app theme: one brand colour (usually taken from the shop logo) → every
 * shade the design tokens need (src/styles/_tokens.scss).
 *
 * Shades are made in OKLCH, so lighter and darker versions keep the hue the eye sees, and the
 * main colour is darkened when needed so white text on buttons keeps WCAG AA contrast (4.5:1).
 */

/** sRGB channels, 0…1. */
export type Rgb = readonly [number, number, number];

/** OKLCH: lightness 0…1, chroma 0…~0.37, hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** The built-in theme's main colour (teal, as in _tokens.scss). */
export const DEFAULT_THEME_COLOR = '#0F766E';

/** The CSS custom properties a theme sets (all others keep their _tokens.scss values). */
export const THEME_VARIABLES = [
  '--c-primary',
  '--c-primary-hover',
  '--c-primary-soft',
  '--c-primary-text',
  '--c-primary-flash',
  '--c-focus',
  '--c-table-head-bg',
  '--c-table-head-text',
  '--c-table-head-border',
  '--sidebar-bg',
  '--sidebar-active',
  '--sidebar-accent',
] as const;

export type ThemeVariable = (typeof THEME_VARIABLES)[number];
export type ThemePalette = Readonly<Record<ThemeVariable, string>>;

const WHITE: Rgb = [1, 1, 1];
/** Contrast white button text needs on the main colour (WCAG AA is 4.5; a little margin). */
const BUTTON_TEXT_CONTRAST = 4.6;
/** Below this chroma a colour reads as grey; its hue is noise and is dropped. */
const GREY_CHROMA = 0.03;

// ---- Conversions ---------------------------------------------------------------------------------

/** '#1f2a5a', '1F2A5A' → '#1F2A5A'; '' for anything else. */
export function normalizeHex(value: string | null | undefined): string {
  const match = /^#?([0-9a-f]{6})$/i.exec((value ?? '').trim());
  return match ? `#${match[1]!.toUpperCase()}` : '';
}

export function hexToRgb(hex: string): Rgb {
  const value = normalizeHex(hex);
  if (!value) {
    throw new Error(`Not a #RRGGBB colour: ${hex}`);
  }
  const n = parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(clamp(channel, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function rgbToOklab(rgb: Rgb): Oklab {
  const [r, g, b] = rgb.map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Linear sRGB — may fall outside 0…1 for colours a screen cannot show. */
function oklabToLinear(lab: Oklab): [number, number, number] {
  const l = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToRgb(lab: Oklab): Rgb {
  return oklabToLinear(lab).map((channel) => fromLinear(clamp(channel, 0, 1))) as unknown as Rgb;
}

export function hexToOklch(hex: string): Oklch {
  const { l, a, b } = rgbToOklab(hexToRgb(hex));
  const c = Math.hypot(a, b);
  return { l, c, h: c < 1e-4 ? 0 : (Math.atan2(b, a) * 180) / Math.PI + (b < 0 ? 360 : 0) };
}

/**
 * The screen colour for an OKLCH value. Colours a screen cannot show keep their lightness and
 * hue and lose chroma until they fit.
 */
export function oklchToRgb(color: Oklch): Rgb {
  const lab = (c: number): Oklab => ({
    l: color.l,
    a: c * Math.cos((color.h * Math.PI) / 180),
    b: c * Math.sin((color.h * Math.PI) / 180),
  });
  const fits = (c: number) => oklabToLinear(lab(c)).every((ch) => ch >= -1e-4 && ch <= 1 + 1e-4);
  let c = Math.max(0, color.c);
  if (!fits(c)) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid;
      else high = mid;
    }
    c = low;
  }
  return oklabToRgb(lab(c));
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1…21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

// ---- Palette -------------------------------------------------------------------------------------

/** Every themed design token, built from one brand colour ('#RRGGBB'). */
export function buildThemePalette(brand: string): ThemePalette {
  const base = hexToOklch(brand);
  const c = base.c < GREY_CHROMA ? 0 : base.c;
  const shade = (l: number, chroma: number): Rgb => oklchToRgb({ l, c: chroma, h: base.h });

  // Main colour: the brand colour when white text reads well on it, otherwise darkened until it
  // does. Near-black is lifted a little so hover and selected states still show.
  const mainChroma = Math.min(c, 0.22);
  let l = clamp(base.l, 0.3, 0.64);
  let primary = shade(l, mainChroma);
  while (contrastRatio(WHITE, primary) < BUTTON_TEXT_CONTRAST && l > 0.2) {
    l -= 0.01;
    primary = shade(l, mainChroma);
  }
  const hover = shade(l >= 0.36 ? l - 0.06 : l + 0.06, mainChroma);
  const text = shade(Math.min(l - 0.05, 0.45), Math.min(c, 0.15));
  const accent = shade(0.8, Math.min(c, 0.16));

  return {
    '--c-primary': rgbToHex(primary),
    '--c-primary-hover': rgbToHex(hover),
    '--c-primary-soft': rgbToHex(shade(0.965, Math.min(c * 0.2, 0.022))),
    '--c-primary-text': rgbToHex(text),
    '--c-primary-flash': rgbToHex(shade(0.93, Math.min(c * 0.5, 0.07))),
    '--c-focus': rgba(primary, 0.28),
    '--c-table-head-bg': rgbToHex(shade(0.94, Math.min(c * 0.25, 0.035))),
    '--c-table-head-text': rgbToHex(text),
    '--c-table-head-border': rgbToHex(shade(0.86, Math.min(c * 0.5, 0.06))),
    '--sidebar-bg': rgbToHex(shade(0.235, Math.min(c * 0.35, 0.045))),
    '--sidebar-active': rgba(accent, 0.14),
    '--sidebar-accent': rgbToHex(accent),
  };
}

/**
 * True for reds close to the colour of Delete buttons and error messages (--c-danger), where a
 * theme in that colour makes ordinary buttons look like warnings.
 */
export function resemblesDanger(brand: string): boolean {
  if (!normalizeHex(brand)) {
    return false;
  }
  const color = hexToOklch(brand);
  const danger = hexToOklch('#DC2626');
  const hueGap = Math.abs(((color.h - danger.h + 540) % 360) - 180);
  return color.c >= 0.1 && hueGap <= 18;
}

function rgba(rgb: Rgb, alpha: number): string {
  const [r, g, b] = rgb.map((channel) => Math.round(clamp(channel, 0, 1) * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

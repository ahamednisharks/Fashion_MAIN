import {
  THEME_VARIABLES,
  buildThemePalette,
  contrastRatio,
  hexToOklch,
  hexToRgb,
  normalizeHex,
  oklchToRgb,
  resemblesDanger,
  rgbToHex,
} from './theme-palette';

const WHITE = [1, 1, 1] as const;
const contrastOnWhite = (hex: string) => contrastRatio(WHITE, hexToRgb(hex));
const HEX = /^#[0-9A-F]{6}$/;

describe('theme palette', () => {
  it('normalises HEX codes and round-trips them', () => {
    expect(normalizeHex(' 1f2a5a ')).toBe('#1F2A5A');
    expect(normalizeHex('#abcdef')).toBe('#ABCDEF');
    expect(normalizeHex('#abc')).toBe('');
    expect(normalizeHex('red')).toBe('');
    expect(normalizeHex(null)).toBe('');
    for (const hex of ['#000000', '#FFFFFF', '#0F766E', '#C62828', '#D4A017']) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
      expect(rgbToHex(oklchToRgb(hexToOklch(hex)))).toBe(hex);
    }
  });

  it('measures WCAG contrast', () => {
    expect(contrastRatio(WHITE, [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    expect(contrastOnWhite('#0F766E')).toBeCloseTo(5.47, 1);
  });

  it('keeps colours a screen cannot show inside the screen gamut', () => {
    const rgb = oklchToRgb({ l: 0.8, c: 0.4, h: 260 });
    rgb.forEach((channel) => expect(channel).toBeGreaterThanOrEqual(0));
    rgb.forEach((channel) => expect(channel).toBeLessThanOrEqual(1));
  });

  it('builds every themed token', () => {
    const palette = buildThemePalette('#1F2A5A');
    expect(Object.keys(palette).sort()).toEqual([...THEME_VARIABLES].sort());
    for (const name of THEME_VARIABLES) {
      expect(palette[name]).toMatch(
        name === '--c-focus' || name === '--sidebar-active' ? /^rgba\(/ : HEX,
      );
    }
  });

  it('keeps a brand colour that white text already reads well on', () => {
    expect(buildThemePalette('#0F766E')['--c-primary']).toBe('#0F766E');
    expect(buildThemePalette('#800020')['--c-primary']).toBe('#800020');
    expect(buildThemePalette('#1F2A5A')['--c-primary']).toBe('#1F2A5A');
  });

  it('darkens light logo colours until white button text is readable (WCAG AA)', () => {
    for (const logo of ['#D4A017', '#7EC8E3', '#39FF14', '#FFEB3B', '#F57C00', '#E75480']) {
      const palette = buildThemePalette(logo);
      expect(contrastOnWhite(palette['--c-primary'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastOnWhite(palette['--c-primary-text'])).toBeGreaterThanOrEqual(4.5);
      // Same hue family: gold stays gold-ish, not grey.
      expect(Math.abs(hexToOklch(palette['--c-primary']).h - hexToOklch(logo).h)).toBeLessThan(12);
    }
  });

  it('gives light tints, a dark menu and a light menu accent', () => {
    const palette = buildThemePalette('#C62828');
    expect(hexToOklch(palette['--c-primary-soft']).l).toBeGreaterThan(0.95);
    expect(hexToOklch(palette['--c-table-head-bg']).l).toBeGreaterThan(0.92);
    expect(hexToOklch(palette['--sidebar-bg']).l).toBeLessThan(0.26);
    expect(
      contrastRatio(hexToRgb(palette['--sidebar-accent']), hexToRgb(palette['--sidebar-bg'])),
    ).toBeGreaterThan(7);
    // Table heading text stays readable on its tinted background.
    expect(
      contrastRatio(
        hexToRgb(palette['--c-table-head-text']),
        hexToRgb(palette['--c-table-head-bg']),
      ),
    ).toBeGreaterThan(4.5);
  });

  it('makes a grey theme from a black logo, lifted so hover still shows', () => {
    const palette = buildThemePalette('#000000');
    for (const name of THEME_VARIABLES) {
      const value = palette[name];
      if (HEX.test(value)) {
        expect(hexToOklch(value).c).toBeLessThan(0.002);
      }
    }
    expect(palette['--c-primary']).not.toBe('#000000');
    expect(palette['--c-primary-hover']).not.toBe(palette['--c-primary']);
  });

  it('warns only for reds close to the Delete / error colour', () => {
    expect(resemblesDanger('#C62828')).toBe(true);
    expect(resemblesDanger('#800020')).toBe(true);
    expect(resemblesDanger('#E75480')).toBe(false); // pink
    expect(resemblesDanger('#F57C00')).toBe(false); // orange
    expect(resemblesDanger('#0F766E')).toBe(false);
    expect(resemblesDanger('#5A5050')).toBe(false); // greyish
    expect(resemblesDanger('')).toBe(false);
  });
});

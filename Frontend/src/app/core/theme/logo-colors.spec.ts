import { pickLogoColors } from './logo-colors';
import { hexToOklch } from './theme-palette';

type Paint = readonly [r: number, g: number, b: number, a?: number];

/** RGBA pixels: `count` pixels of each paint, in order. */
function pixels(...areas: (readonly [Paint, number])[]): Uint8ClampedArray {
  const total = areas.reduce((sum, [, count]) => sum + count, 0);
  const data = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [[r, g, b, a = 255], count] of areas) {
    for (let n = 0; n < count; n++, i += 4) {
      data.set([r, g, b, a], i);
    }
  }
  return data;
}

const WHITE: Paint = [255, 255, 255];
const CLEAR: Paint = [12, 140, 200, 0];
const RED: Paint = [198, 40, 40];
const GOLD: Paint = [212, 160, 23];
const NAVY: Paint = [31, 42, 90];
const BLACK: Paint = [20, 20, 20];

const hue = (hex: string) => hexToOklch(hex).h;

describe('logo colours', () => {
  it('ignores white paper and transparent background', () => {
    expect(pickLogoColors(pixels([WHITE, 500], [CLEAR, 500]))).toEqual([]);
  });

  it('lists the largest colour first and leaves out specks', () => {
    const colors = pickLogoColors(
      pixels([WHITE, 2000], [RED, 600], [GOLD, 300], [NAVY, 8], [CLEAR, 1000]),
    );
    expect(colors).toEqual(['#C62828', '#D4A017']);
  });

  it('prefers a vivid ink over a slightly larger dull one', () => {
    const khaki: Paint = [185, 165, 110];
    const colors = pickLogoColors(pixels([khaki, 400], [RED, 330]));
    expect(colors[0]).toBe('#C62828');
    expect(colors).toHaveLength(2);
  });

  it('counts near shades of one ink as one colour', () => {
    const colors = pickLogoColors(pixels([RED, 300], [[201, 44, 42], 300], [[193, 36, 38], 300]));
    expect(colors).toHaveLength(1);
    expect(Math.abs(hue(colors[0]!) - hue('#C62828'))).toBeLessThan(3);
  });

  it('offers black last, and alone for a black-and-white logo', () => {
    expect(pickLogoColors(pixels([WHITE, 500], [BLACK, 300]))).toEqual(['#141414']);
    expect(pickLogoColors(pixels([BLACK, 500], [NAVY, 300]))).toEqual(['#1F2A5A', '#141414']);
    // A little black text next to a big colour block is not offered.
    expect(pickLogoColors(pixels([RED, 2000], [BLACK, 40]))).toEqual(['#C62828']);
  });

  it('stops at the requested number of colours', () => {
    const many = pickLogoColors(
      pixels([RED, 300], [GOLD, 300], [NAVY, 300], [[40, 160, 70], 300], [[140, 60, 170], 300]),
      3,
    );
    expect(many).toHaveLength(3);
  });
});

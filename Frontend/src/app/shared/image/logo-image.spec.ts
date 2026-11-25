import { contentBounds, dataUrlBytes, fitWithin } from './logo-image';

/** RGBA pixels of a white `width` × `height` picture with the given pixels painted black. */
function picture(width: number, height: number, black: [number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y] of black) {
    data.set([0, 0, 0, 255], (y * width + x) * 4);
  }
  return data;
}

describe('logo image', () => {
  it('scales the longest side down but never up', () => {
    expect(fitWithin({ width: 2000, height: 1000 }, 480)).toEqual({ width: 480, height: 240 });
    expect(fitWithin({ width: 300, height: 900 }, 480)).toEqual({ width: 160, height: 480 });
    expect(fitWithin({ width: 200, height: 100 }, 480)).toEqual({ width: 200, height: 100 });
    expect(fitWithin({ width: 5000, height: 2 }, 480)).toEqual({ width: 480, height: 1 });
  });

  it('finds the content inside blank (white or transparent) margins', () => {
    const data = picture(6, 5, [
      [2, 1],
      [4, 3],
    ]);
    expect(contentBounds(data, 6, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });

    // Transparent pixels count as blank whatever their colour.
    data.set([0, 0, 0, 0], 0);
    expect(contentBounds(data, 6, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
    // Near-white is blank, light grey is not.
    data.set([250, 250, 250, 255], 4);
    expect(contentBounds(data, 6, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
    data.set([200, 200, 200, 255], 4);
    expect(contentBounds(data, 6, 5)).toEqual({ x: 1, y: 0, width: 4, height: 4 });
  });

  it('reports a blank picture', () => {
    expect(contentBounds(picture(4, 4, []), 4, 4)).toBeNull();
  });

  it('counts the bytes held by a data URL', () => {
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUrlBytes('data:image/png;base64,AA==')).toBe(1);
    expect(dataUrlBytes(`data:image/png;base64,${btoa('x'.repeat(1000))}`)).toBe(1000);
  });
});

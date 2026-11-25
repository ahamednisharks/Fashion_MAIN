/**
 * Turns a picture the user picked into a small logo image (data URL) for printing on bills:
 * blank (white / transparent) margins are cropped, the longest side is scaled down to
 * LOGO_MAX_SIDE px and the result is encoded as PNG — or WebP / JPEG when PNG is too large —
 * so it stays under the server's 256 KB limit.
 */

/** File types offered in the file picker. */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/bmp';

/** Longest side of the saved logo, in px (an 80 mm receipt prints ~380 dots across 48 mm). */
export const LOGO_MAX_SIDE = 480;
/** Largest picture accepted before resizing. */
export const LOGO_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** Encoded size to stay under (the server accepts up to 256 KB). */
const TARGET_BYTES = 200 * 1024;
/** Working size used to find the blank margins. */
const WORK_SIDE = 1200;

export class LogoImageError extends Error {}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Scales `size` down (never up) so that its longest side is at most `maxSide`. */
export function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height, 1));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * The smallest box holding every pixel that is not blank (transparent or near-white), or null
 * when the whole picture is blank. `data` is RGBA, row by row (as in ImageData).
 */
export function contentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | null {
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const blank =
        data[i + 3]! < 16 || (data[i]! > 245 && data[i + 1]! > 245 && data[i + 2]! > 245);
      if (!blank) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Bytes of data held by a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Reads, crops, resizes and encodes a picture as a logo data URL. */
export async function prepareLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new LogoImageError('Choose a picture file (PNG, JPG, WebP or SVG).');
  }
  if (file.size > LOGO_MAX_SOURCE_BYTES) {
    throw new LogoImageError('The picture is larger than 10 MB. Choose a smaller one.');
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new LogoImageError('This picture could not be read. Use a PNG, JPG or WebP file.');
    }
    // SVGs without a size report 0 × 0 in some browsers.
    const natural = {
      width: image.naturalWidth || WORK_SIDE,
      height: image.naturalHeight || WORK_SIDE,
    };

    // Draw at a working size and find the blank margins.
    const work = fitWithin(natural, WORK_SIDE);
    const workCanvas = canvasOf(work);
    const workContext = context2d(workCanvas);
    workContext.drawImage(image, 0, 0, work.width, work.height);
    const pixels = workContext.getImageData(0, 0, work.width, work.height).data;
    const bounds = contentBounds(pixels, work.width, work.height);
    if (!bounds) {
      throw new LogoImageError('The picture looks blank. Choose another one.');
    }

    // Crop to the content (with a little padding) and scale to the final size.
    const pad = Math.round(Math.max(bounds.width, bounds.height) * 0.02);
    const crop = {
      x: Math.max(0, bounds.x - pad),
      y: Math.max(0, bounds.y - pad),
      width: Math.min(work.width, bounds.x + bounds.width + pad) - Math.max(0, bounds.x - pad),
      height: Math.min(work.height, bounds.y + bounds.height + pad) - Math.max(0, bounds.y - pad),
    };
    const size = fitWithin(crop, LOGO_MAX_SIDE);
    const canvas = canvasOf(size);
    const context = context2d(canvas);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      workCanvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      size.width,
      size.height,
    );

    return encode(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PNG keeps sharp edges and transparency; fall back to smaller formats for photo-like logos. */
function encode(canvas: HTMLCanvasElement): string {
  const png = canvas.toDataURL('image/png');
  if (dataUrlBytes(png) <= TARGET_BYTES) {
    return png;
  }
  for (const quality of [0.92, 0.8]) {
    const webp = canvas.toDataURL('image/webp', quality);
    // Browsers that cannot encode WebP return a PNG instead.
    if (webp.startsWith('data:image/webp') && dataUrlBytes(webp) <= TARGET_BYTES) {
      return webp;
    }
  }
  // JPEG has no transparency — put the logo on white paper first.
  const flat = canvasOf(canvas);
  const context = context2d(flat);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, 0, 0);
  const jpeg = flat.toDataURL('image/jpeg', 0.85);
  if (dataUrlBytes(jpeg) <= TARGET_BYTES) {
    return jpeg;
  }
  throw new LogoImageError('This picture is too detailed to use as a logo. Try a simpler one.');
}

function canvasOf(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new LogoImageError('This browser cannot process pictures.');
  }
  return context;
}

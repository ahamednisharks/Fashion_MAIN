import type { TDocumentDefinitions, TVirtualFileSystem } from 'pdfmake/interfaces';

type PdfMake = typeof import('pdfmake/build/pdfmake');

let pdfMakeLoading: Promise<PdfMake> | null = null;

/** CommonJS modules arrive as `{ default: module.exports }` (or as the exports themselves). */
function unwrap<T>(module: unknown): T {
  return ((module as { default?: T }).default ?? module) as T;
}

/**
 * pdfmake and its Roboto fonts (~1 MB) are loaded on first use only, so they never weigh on
 * the app's start-up. Roboto covers ₹, −, · and —.
 */
function loadPdfMake(): Promise<PdfMake> {
  pdfMakeLoading ??= Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]).then(([maker, fonts]) => {
    const pdfMake = unwrap<PdfMake>(maker);
    pdfMake.addVirtualFileSystem(unwrap<TVirtualFileSystem>(fonts));
    return pdfMake;
  });
  pdfMakeLoading.catch(() => (pdfMakeLoading = null));
  return pdfMakeLoading;
}

/** Builds the PDF in the browser and saves it as `fileName` (no server round trip). */
export async function downloadPdf(document: TDocumentDefinitions, fileName: string): Promise<void> {
  const pdfMake = await loadPdfMake();
  await pdfMake.createPdf(document).download(fileName);
}

/**
 * pdfmake reads PNG and JPEG only, so other image data URLs (the shop logo may be WebP, SVG or
 * GIF) are redrawn as PNG. Null when there is no image or it cannot be read.
 */
export async function pdfImage(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  if (/^data:image\/(png|jpe?g)[;,]/i.test(dataUrl)) return dataUrl;
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 480;
    canvas.height = image.naturalHeight || 160;
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

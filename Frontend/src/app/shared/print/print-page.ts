/**
 * Prints the current page on A4 paper. While the print dialog is open, <body> gets the
 * `print-report` class, so the app chrome and anything marked `.no-print` are hidden
 * (styles/_print.scss), and an A4 @page rule replaces the 80 mm receipt margins.
 */
export function printPage(): void {
  const body = document.body;
  const pageStyle = document.createElement('style');
  pageStyle.textContent = '@page { size: A4; margin: 12mm 10mm; }';
  document.head.appendChild(pageStyle);
  body.classList.add('print-report');
  const done = () => {
    body.classList.remove('print-report');
    pageStyle.remove();
  };
  window.addEventListener('afterprint', done, { once: true });
  window.print();
}

/**
 * Resolves once every <img> inside `root` has loaded and decoded (or failed to), so a print
 * started right after rendering does not go out without its pictures (e.g. the shop logo).
 */
export async function imagesReady(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
}

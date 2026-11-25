/** Bill number prefix: INV/26-27/00001. */
export const INVOICE_PREFIX = 'INV';

/** Indian financial year (April–March) of a YYYY-MM-DD date: '2026-11-23' → '26-27'. */
export function financialYearOf(isoDate: string): string {
  const [year = 0, month = 0] = isoDate.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  const two = (value: number) => String(value % 100).padStart(2, '0');
  return `${two(start)}-${two(start + 1)}`;
}

/** INV/26-27/00042 — at most 16 characters as GST rules require (up to 999,999 bills a year). */
export function formatInvoiceNo(financialYear: string, sequence: number): string {
  return `${INVOICE_PREFIX}/${financialYear}/${String(sequence).padStart(5, '0')}`;
}

/** Number series of purchase orders in document_counters. */
export const PO_SERIES = 'PO';

/**
 * The year an Indian financial year (April–March) starts in:
 * '2026-11-24' → 2026, '2027-02-15' → 2026, '2027-04-01' → 2027.
 */
export function financialYearStart(isoDate: string): number {
  const [year = 0, month = 0] = isoDate.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

/** PO-2026-00042 (numbering restarts every April). */
export function formatPoNo(financialYear: number, sequence: number): string {
  return `${PO_SERIES}-${financialYear}-${String(sequence).padStart(5, '0')}`;
}

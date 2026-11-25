/** Number series of stock adjustments in document_counters. */
export const ADJ_SERIES = 'ADJ';

/** ADJ-2026-00042 (numbering restarts every April, like purchase orders and entries). */
export function formatAdjNo(financialYear: number, sequence: number): string {
  return `${ADJ_SERIES}-${financialYear}-${String(sequence).padStart(5, '0')}`;
}

/** Number series of purchase entries in document_counters. */
export const PE_SERIES = 'PE';

/** PE-2026-00042 (numbering restarts every April, like purchase orders). */
export function formatPeNo(financialYear: number, sequence: number): string {
  return `${PE_SERIES}-${financialYear}-${String(sequence).padStart(5, '0')}`;
}

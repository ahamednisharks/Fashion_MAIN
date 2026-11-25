import { AdjustmentStatus } from '../../core/models/stock-adjustment.model';

/** Badge class per stock adjustment status (see styles/_badges.scss). */
export function adjustmentStatusBadge(status: AdjustmentStatus): string {
  return status === 'posted' ? 'badge-success' : 'badge-danger';
}

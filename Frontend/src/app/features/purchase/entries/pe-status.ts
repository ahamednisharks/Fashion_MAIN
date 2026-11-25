import { PeStatus } from '../../../core/models/purchase-entry.model';

/** Badge class per purchase entry status (see styles/_badges.scss). */
export function peStatusBadge(status: PeStatus): string {
  return status === 'posted' ? 'badge-success' : 'badge-danger';
}

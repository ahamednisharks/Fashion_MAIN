import { PoStatus } from '../../../core/models/purchase-order.model';

/** Badge class per PO status (see styles/_badges.scss). */
export function poStatusBadge(status: PoStatus): string {
  switch (status) {
    case 'open':
      return 'badge-info';
    case 'partial':
      return 'badge-warning';
    case 'received':
      return 'badge-success';
    case 'cancelled':
      return 'badge-danger';
  }
}

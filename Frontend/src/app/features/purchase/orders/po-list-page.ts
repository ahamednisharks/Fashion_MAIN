import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ListQuery } from '../../../core/data-access/api.types';
import { PurchaseOrderService } from '../../../core/data-access/purchase-order.service';
import { PO_STATUS_LABELS, PoStatus, PoSummary } from '../../../core/models/purchase-order.model';
import { Icon } from '../../../shared/components/icon/icon';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { injectListController } from '../../../shared/list/list-controller';
import { poStatusBadge } from './po-status';

const STATUS_OPTIONS = (Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((value) => ({
  value,
  label: PO_STATUS_LABELS[value],
}));

/** Purchase orders, newest first; search, status and date filters live in the URL. */
@Component({
  selector: 'app-po-list-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    Icon,
    PageHeader,
    ListToolbar,
    Pagination,
    EmptyState,
    ErrorState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './po-list-page.html',
  host: { class: 'list-page' },
  styles: `
    .date-filter {
      width: 150px;
    }
    .is-cancelled td {
      color: var(--c-text-3);
    }
  `,
})
export class PoListPage {
  private readonly orders = inject(PurchaseOrderService);

  protected readonly list = injectListController(
    (query: ListQuery) =>
      this.orders.list({
        search: query.search,
        status: (query.filters['state'] ?? '') as PoStatus | '',
        from: query.filters['from'],
        to: query.filters['to'],
        page: query.page,
        pageSize: query.pageSize,
      }),
    { filterKeys: ['state', 'from', 'to'] },
  );

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly statusLabels = PO_STATUS_LABELS;
  protected readonly statusBadge = poStatusBadge;

  /** Open POs (nothing received yet) can be edited. */
  protected isOpen(po: PoSummary): boolean {
    return po.status === 'open';
  }

  /** Goods can still be received against open and partly received POs. */
  protected isReceivable(po: PoSummary): boolean {
    return po.status === 'open' || po.status === 'partial';
  }
}

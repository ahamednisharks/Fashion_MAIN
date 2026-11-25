import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ListQuery } from '../../../core/data-access/api.types';
import { PurchaseEntryService } from '../../../core/data-access/purchase-entry.service';
import { PE_STATUS_LABELS, PeStatus } from '../../../core/models/purchase-entry.model';
import { Icon } from '../../../shared/components/icon/icon';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { injectListController } from '../../../shared/list/list-controller';
import { peStatusBadge } from './pe-status';

const STATUS_OPTIONS = (Object.keys(PE_STATUS_LABELS) as PeStatus[]).map((value) => ({
  value,
  label: PE_STATUS_LABELS[value],
}));

/**
 * Purchase entries, newest first; search, status and date filters live in the URL. The page
 * fits the window and the table rows scroll inside it.
 */
@Component({
  selector: 'app-pe-list-page',
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
  templateUrl: './pe-list-page.html',
  styleUrl: './pe-list-page.scss',
})
export class PeListPage {
  private readonly entries = inject(PurchaseEntryService);

  protected readonly list = injectListController(
    (query: ListQuery) =>
      this.entries.list({
        search: query.search,
        status: (query.filters['state'] ?? '') as PeStatus | '',
        from: query.filters['from'],
        to: query.filters['to'],
        page: query.page,
        pageSize: query.pageSize,
      }),
    { filterKeys: ['state', 'from', 'to'] },
  );

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly statusLabels = PE_STATUS_LABELS;
  protected readonly statusBadge = peStatusBadge;
}

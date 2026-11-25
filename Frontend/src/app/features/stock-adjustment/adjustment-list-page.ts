import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ListQuery } from '../../core/data-access/api.types';
import { StockAdjustmentService } from '../../core/data-access/stock-adjustment.service';
import {
  ADJUSTMENT_MODE_LABELS,
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  ADJUSTMENT_STATUS_LABELS,
  AdjustmentReason,
  AdjustmentStatus,
} from '../../core/models/stock-adjustment.model';
import { Icon } from '../../shared/components/icon/icon';
import { ListToolbar } from '../../shared/components/list-toolbar/list-toolbar';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Pagination } from '../../shared/components/pagination/pagination';
import { EmptyState, ErrorState } from '../../shared/components/state-views/state-views';
import { injectListController } from '../../shared/list/list-controller';
import { adjustmentStatusBadge } from './adjustment-status';

/**
 * Stock adjustments, newest first; search, reason, status and date filters live in the URL.
 * The page fits the window and the table rows scroll inside it.
 */
@Component({
  selector: 'app-adjustment-list-page',
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
  templateUrl: './adjustment-list-page.html',
  styleUrl: './adjustment-list-page.scss',
})
export class AdjustmentListPage {
  private readonly adjustments = inject(StockAdjustmentService);

  protected readonly list = injectListController(
    (query: ListQuery) =>
      this.adjustments.list({
        search: query.search,
        reason: (query.filters['reason'] ?? '') as AdjustmentReason | '',
        status: (query.filters['state'] ?? '') as AdjustmentStatus | '',
        from: query.filters['from'],
        to: query.filters['to'],
        page: query.page,
        pageSize: query.pageSize,
      }),
    { filterKeys: ['reason', 'state', 'from', 'to'] },
  );

  protected readonly reasons = ADJUSTMENT_REASONS;
  protected readonly reasonLabels = ADJUSTMENT_REASON_LABELS;
  protected readonly modeLabels = ADJUSTMENT_MODE_LABELS;
  protected readonly statusLabels = ADJUSTMENT_STATUS_LABELS;
  protected readonly statuses = Object.keys(ADJUSTMENT_STATUS_LABELS) as AdjustmentStatus[];
  protected readonly statusBadge = adjustmentStatusBadge;

  /** Value in − value out (₹). */
  protected net(adjustment: { valueIn: number; valueOut: number }): number {
    return Math.round((adjustment.valueIn - adjustment.valueOut) * 100) / 100;
  }
}

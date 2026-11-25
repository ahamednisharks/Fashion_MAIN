import { NgTemplateOutlet, formatCurrency, formatDate, formatNumber } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';

import { SortState } from '../../../core/data-access/api.types';
import { BaseEntity } from '../../../core/models/base.model';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';
import { EmptyState, ErrorState } from '../state-views/state-views';
import { StatusBadge } from '../status-badge/status-badge';
import { CellContext, CellDef } from './cell-def.directive';
import { RowAction, RowActionEvent, TableColumn } from './table.types';

interface CellView<T> {
  readonly column: TableColumn<T>;
  readonly text: string;
  readonly cssClass: string;
  readonly template: TemplateRef<CellContext<unknown>> | null;
}

interface RowView<T> {
  readonly row: T;
  readonly label: string;
  readonly cells: readonly CellView<T>[];
}

const ACTION_ICONS: Record<Exclude<RowAction, 'toggle'>, IconName> = {
  view: 'eye',
  edit: 'pencil-square',
  delete: 'trash3',
};

/**
 * Generic, responsive data table.
 * - Desktop: classic table with optional sortable headers.
 * - Phones (< md): each row becomes a labelled card.
 * - Handles loading (skeleton), error (retry) and empty / no-results states.
 */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet, Icon, StatusBadge, EmptyState, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
})
export class DataTable<T extends BaseEntity> {
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly TableColumn<T>[]>();
  readonly actions = input<readonly RowAction[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly sort = input<SortState | null>(null);
  /** True when search/filters are applied (changes the empty-state message). */
  readonly filtered = input(false);
  /** Plural noun for messages, e.g. "categories". */
  readonly entityName = input('records');
  readonly emptyMessage = input('');
  readonly createLabel = input('');

  readonly action = output<RowActionEvent<T>>();
  readonly sortChange = output<SortState | null>();
  readonly retry = output<void>();
  readonly clearFilters = output<void>();
  readonly create = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly cellDefs = contentChildren(CellDef);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly showSkeleton = computed(() => this.loading() && this.rows().length === 0);

  private readonly templates = computed(() => {
    const map = new Map<string, TemplateRef<CellContext<unknown>>>();
    for (const def of this.cellDefs()) {
      map.set(def.column(), def.template);
    }
    return map;
  });

  protected readonly view = computed<RowView<T>[]>(() => {
    const columns = this.columns();
    const templates = this.templates();
    return this.rows().map((row) => {
      const cells = columns.map((column) => ({
        column,
        text: this.format(column, row),
        cssClass: this.cellClass(column),
        template: templates.get(column.key) ?? null,
      }));
      const titleCell = cells.find((cell) => cell.column.mobile === 'title') ?? cells[0];
      return { row, label: titleCell?.text ?? '', cells };
    });
  });

  protected headerClass(column: TableColumn<T>): string {
    return [this.alignClass(column), column.hideBelow ? `hide-below-${column.hideBelow}` : '']
      .filter(Boolean)
      .join(' ');
  }

  protected ariaSort(column: TableColumn<T>): string | null {
    if (!column.sortable) {
      return null;
    }
    const sort = this.sort();
    if (sort?.field !== column.key) {
      return 'none';
    }
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(column: TableColumn<T>): IconName {
    const sort = this.sort();
    if (sort?.field !== column.key) {
      return 'chevron-expand';
    }
    return sort.direction === 'asc' ? 'caret-up-fill' : 'caret-down-fill';
  }

  /** Cycles ascending → descending → default order. */
  protected toggleSort(column: TableColumn<T>): void {
    const sort = this.sort();
    if (sort?.field !== column.key) {
      this.sortChange.emit({ field: column.key, direction: 'asc' });
    } else if (sort.direction === 'asc') {
      this.sortChange.emit({ field: column.key, direction: 'desc' });
    } else {
      this.sortChange.emit(null);
    }
  }

  protected actionIcon(action: RowAction, row: T): IconName {
    if (action === 'toggle') {
      return row.status === 'active' ? 'toggle-on' : 'toggle-off';
    }
    return ACTION_ICONS[action];
  }

  protected actionLabel(action: RowAction, row: T): string {
    switch (action) {
      case 'view':
        return 'View';
      case 'edit':
        return 'Edit';
      case 'delete':
        return 'Delete';
      case 'toggle':
        return row.status === 'active' ? 'Deactivate' : 'Activate';
    }
  }

  protected emit(action: RowAction, row: T): void {
    this.action.emit({ action, row });
  }

  private format(column: TableColumn<T>, row: T): string {
    if (column.type === 'status') {
      return row.status === 'active' ? 'Active' : 'Inactive';
    }
    const value = column.value?.(row);
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    switch (column.type) {
      case 'currency':
        return formatCurrency(Number(value), this.locale, '₹', 'INR', '1.2-2');
      case 'number':
        return formatNumber(Number(value), this.locale);
      case 'date':
        return formatDate(value, 'dd MMM yyyy', this.locale);
      default:
        return String(value);
    }
  }

  private alignClass(column: TableColumn<T>): string {
    const align =
      column.align ?? (column.type === 'currency' || column.type === 'number' ? 'end' : 'start');
    return align === 'end' ? 'text-end' : align === 'center' ? 'text-center' : '';
  }

  private cellClass(column: TableColumn<T>): string {
    const classes = [this.alignClass(column)];
    if (column.hideBelow) classes.push(`hide-below-${column.hideBelow}`);
    if (column.mobile === 'title') classes.push('cell-title');
    if (column.mobile === 'full') classes.push('cell-full');
    if (column.mobile === 'hidden') classes.push('cell-hide-mobile');
    if (column.type === 'currency' || column.type === 'number') classes.push('nowrap');
    return classes.filter(Boolean).join(' ');
  }
}

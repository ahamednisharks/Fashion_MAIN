import { DecimalPipe, formatNumber } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of, tap } from 'rxjs';

import { ListQuery, SortState, toApiError } from '../../../core/data-access/api.types';
import { BrandService } from '../../../core/data-access/brand.service';
import { ColorService } from '../../../core/data-access/color.service';
import { ReportService } from '../../../core/data-access/report.service';
import { ShopSettingsService } from '../../../core/data-access/shop-settings.service';
import { SizeService } from '../../../core/data-access/size.service';
import {
  STOCK_REPORT_FILTERS,
  StockReportExport,
  StockReportFilter,
  StockReportQuery,
  StockReportRow,
  StockReportTotals,
} from '../../../core/models/report.model';
import { itemDetails } from '../../../core/models/sale.model';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../../../shared/components/icon/icon';
import { IconName } from '../../../shared/components/icon/icon-registry';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { downloadXlsx } from '../../../shared/excel/xlsx-file';
import { injectListController } from '../../../shared/list/list-controller';
import { StockHistoryDialog } from '../../masters/items/stock-history-dialog';
import { DateRange, presetRange, rangeError } from '../date-range';
import { PeriodPicker } from '../period-picker/period-picker';
import {
  downloadStockReportPdf,
  periodLabel,
  stockReportFileName,
  stockReportSheet,
} from './stock-report-files';

/** Kept in the URL: the period and the item filters. */
const FILTER_KEYS = ['from', 'to', 'brandId', 'sizeId', 'colorId', 'stock'] as const;
/** What "Clear" resets — the period stays. */
const PERIOD_KEYS = ['from', 'to'];

const SORT_LABELS: Readonly<Record<string, string>> = {
  name: 'Item',
  sku: 'SKU',
  opening: 'Opening',
  purchased: 'Purchase',
  sold: 'Sales',
  adjusted: 'Adjust',
  closing: 'Closing',
  stockValue: 'Value (₹)',
};

interface Figure {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'in' | 'out' | 'strong';
}

/** The period in the URL, or this month (1st to today) when there is none / it is not valid. */
function rangeOf(query: ListQuery): DateRange {
  const range = { from: query.filters['from'] ?? '', to: query.filters['to'] ?? '' };
  return rangeError(range) ? presetRange('thisMonth') : range;
}

function stockFilterOf(query: ListQuery): StockReportFilter {
  const value = query.filters['stock'];
  return STOCK_REPORT_FILTERS.some((option) => option.value === value)
    ? (value as StockReportFilter)
    : 'any';
}

/**
 * Stock Report (view only): for a period (default this month) each item's opening stock, goods
 * received (purchase entries), sold (bills), adjusted, and the closing stock with its value at
 * the purchase rate. Filter by brand, size, colour, stock and search; download the whole list
 * as Excel or PDF. Click a closing figure for the item's stock history. Administrators only.
 */
@Component({
  selector: 'app-stock-report-page',
  imports: [
    DecimalPipe,
    Icon,
    PageHeader,
    PeriodPicker,
    ListToolbar,
    Pagination,
    EmptyState,
    ErrorState,
    StockHistoryDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stock-report-page.html',
  styleUrl: './stock-report-page.scss',
})
export class StockReportPage {
  private readonly reports = inject(ReportService);
  private readonly shopSettings = inject(ShopSettingsService);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);

  /** Totals of every matching item (not only the page on screen). */
  protected readonly totals = signal<StockReportTotals | null>(null);

  protected readonly list = injectListController(
    (query: ListQuery) =>
      this.reports
        .stock({ ...this.reportQuery(query), page: query.page, pageSize: query.pageSize })
        .pipe(tap((report) => this.totals.set(report.totals))),
    { filterKeys: FILTER_KEYS, defaultPageSize: 25 },
  );

  protected readonly range = computed(() => rangeOf(this.list.query()));
  protected readonly stockFilter = computed(() => stockFilterOf(this.list.query()));
  protected readonly stockOptions = STOCK_REPORT_FILTERS;
  /** Search / status / item filters in use (the period is not a filter "Clear" removes). */
  protected readonly hasItemFilters = computed(() => {
    const query = this.list.query();
    return (
      !!query.search ||
      !!query.status ||
      FILTER_KEYS.some((key) => !PERIOD_KEYS.includes(key) && !!query.filters[key])
    );
  });

  // Filter options include inactive records so older items can still be found.
  protected readonly brands = toSignal(
    inject(BrandService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly sizes = toSignal(
    inject(SizeService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly colors = toSignal(
    inject(ColorService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly figures = computed<Figure[]>(() => {
    const t = this.totals();
    if (!t) return [];
    const quantity = (value: number) => formatNumber(value, this.locale, '1.0-3');
    return [
      { label: 'Opening stock', value: quantity(t.opening) },
      { label: 'Purchase (in)', value: this.signed(t.purchased), tone: 'in' },
      { label: 'Sales (out)', value: this.signed(-t.sold), tone: 'out' },
      { label: 'Adjustment', value: this.signed(t.adjusted) },
      { label: 'Closing stock', value: quantity(t.closing), tone: 'strong' },
      {
        label: 'Stock value',
        value: `₹${formatNumber(t.stockValue, this.locale, '1.2-2')}`,
        tone: 'strong',
      },
    ];
  });

  /** The item whose stock history is open. */
  protected readonly historyItem = signal<StockReportRow | null>(null);
  protected readonly exporting = signal<'excel' | 'pdf' | null>(null);
  protected readonly itemDetails = itemDetails;
  protected readonly sortLabels = SORT_LABELS;

  protected rowKey(row: StockReportRow): string {
    return `${row.productId}|${row.variantId ?? ''}`;
  }

  // ---- Period and filters ------------------------------------------------------------------------

  protected setRange(range: DateRange): void {
    this.list.setFilters({ from: range.from, to: range.to });
  }

  protected clearItemFilters(): void {
    this.list.clearFilters(PERIOD_KEYS);
  }

  protected setStock(value: string): void {
    // "With stock or movement" is the default, so it stays out of the URL.
    this.list.setFilter('stock', value === 'any' ? '' : value);
  }

  // ---- Sorting -----------------------------------------------------------------------------------

  protected sortIcon(key: string): IconName {
    const sort = this.list.query().sort;
    if (sort?.field !== key) return 'chevron-expand';
    return sort.direction === 'asc' ? 'caret-up-fill' : 'caret-down-fill';
  }

  protected ariaSort(key: string): 'ascending' | 'descending' | null {
    const sort = this.list.query().sort;
    if (sort?.field !== key) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  /** Item names start A→Z; figures start with the largest. */
  protected toggleSort(key: string): void {
    const sort = this.list.query().sort;
    const first = key === 'name' || key === 'sku' ? 'asc' : 'desc';
    const second = first === 'asc' ? 'desc' : 'asc';
    let next: SortState | null = { field: key, direction: first };
    if (sort?.field === key) {
      next = sort.direction === first ? { field: key, direction: second } : null;
    }
    this.list.setSort(next);
  }

  // ---- Downloads ---------------------------------------------------------------------------------

  protected async downloadExcel(): Promise<void> {
    await this.download('excel', async (report) => {
      downloadXlsx(
        stockReportFileName(report, 'xlsx'),
        stockReportSheet(report, { ...(await this.fileContext()), logo: null }),
      );
    });
  }

  protected async downloadPdf(): Promise<void> {
    await this.download('pdf', async (report) => {
      const [context, logo] = await Promise.all([
        this.fileContext(),
        this.shopSettings.loadLogo().catch(() => ''),
      ]);
      await downloadStockReportPdf(report, { ...context, logo });
    });
  }

  /** Loads every matching row (not just this page), then builds the file. */
  private async download(
    kind: 'excel' | 'pdf',
    build: (report: StockReportExport) => Promise<void>,
  ): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(kind);
    try {
      const report = await firstValueFrom(
        this.reports.stockExport(this.reportQuery(this.list.query())),
      );
      await build(report);
      if (report.truncated) {
        this.toast.warning(
          `The file lists the first ${report.items.length} of ${report.totals.itemCount} items. ` +
            'Narrow the filters to get the rest.',
        );
      }
    } catch (error) {
      const file = kind === 'excel' ? 'Excel file' : 'PDF';
      this.toast.error(`Couldn't create the ${file}: ${toApiError(error).message}`);
    } finally {
      this.exporting.set(null);
    }
  }

  private async fileContext() {
    const shop = await firstValueFrom(this.shopSettings.getProfile()).catch(() =>
      this.shopSettings.localProfile(),
    );
    return {
      shop,
      locale: this.locale,
      filters: this.filterLabels(),
      printedAt: new Date(),
    };
  }

  /** The filters in use, for the file's heading. */
  private filterLabels(): [string, string][] {
    const query = this.list.query();
    const name = (options: readonly { id: string; name: string }[], id: string | undefined) =>
      options.find((option) => option.id === id)?.name ?? '';
    const labels: [string, string][] = [];
    const brand = name(this.brands(), query.filters['brandId']);
    const size = name(this.sizes(), query.filters['sizeId']);
    const color = name(this.colors(), query.filters['colorId']);
    if (brand) labels.push(['Brand', brand]);
    if (size) labels.push(['Size', size]);
    if (color) labels.push(['Colour', color]);
    if (query.search) labels.push(['Search', `“${query.search}”`]);
    if (query.status) labels.push(['Status', query.status === 'active' ? 'Active' : 'Inactive']);
    const stock = this.stockFilter();
    if (stock !== 'any') {
      labels.push(['Showing', STOCK_REPORT_FILTERS.find((o) => o.value === stock)?.label ?? '']);
    }
    return labels;
  }

  private reportQuery(query: ListQuery): StockReportQuery {
    const { from, to } = rangeOf(query);
    return {
      from,
      to,
      search: query.search,
      status: query.status,
      brandId: query.filters['brandId'],
      sizeId: query.filters['sizeId'],
      colorId: query.filters['colorId'],
      stock: stockFilterOf(query),
      sort: query.sort,
    };
  }

  // ---- Formatting --------------------------------------------------------------------------------

  protected periodLabel(range: DateRange): string {
    return periodLabel(range, this.locale);
  }

  /** "+3", "−2", "0" */
  protected signed(value: number): string {
    const text = formatNumber(Math.abs(value), this.locale, '1.0-3');
    if (value > 0) return `+${text}`;
    if (value < 0) return `−${text}`;
    return text;
  }
}

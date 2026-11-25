import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { ReportService } from '../../../core/data-access/report.service';
import { SalesReport, SalesTotals } from '../../../core/models/report.model';
import { Icon } from '../../../shared/components/icon/icon';
import { IconName } from '../../../shared/components/icon/icon-registry';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import {
  SegmentOption,
  SegmentedControl,
} from '../../../shared/components/segmented-control/segmented-control';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { printPage } from '../../../shared/print/print-page';
import { CsvValue, downloadCsv, toCsv } from '../csv';
import { DateRange, daysInRange, presetRange } from '../date-range';
import { PeriodPicker } from '../period-picker/period-picker';
import { PeriodBills } from './period-bills';

type ReportView = 'days' | 'bills';

interface StatTile {
  readonly label: string;
  readonly icon: IconName;
  readonly value: string;
  readonly detail: string;
}

interface PaymentRow {
  readonly label: string;
  readonly icon: IconName;
  readonly amount: number;
  /** Share of all payments, 0–100. */
  readonly share: number;
}

const VIEW_OPTIONS: readonly SegmentOption<ReportView>[] = [
  { value: 'days', label: 'Day-wise' },
  { value: 'bills', label: 'Bill-wise' },
];

/** Columns of the CSV export (every amount, so it can be filed / re-checked in Excel). */
const CSV_COLUMNS: readonly {
  readonly label: string;
  readonly value: (t: SalesTotals) => number;
}[] = [
  { label: 'Bills', value: (t) => t.billCount },
  { label: 'Quantity', value: (t) => t.quantity },
  { label: 'Gross amount', value: (t) => t.grossAmount },
  { label: 'Discount', value: (t) => t.discountTotal },
  { label: 'Taxable value', value: (t) => t.taxableTotal },
  { label: 'CGST', value: (t) => t.cgstTotal },
  { label: 'SGST', value: (t) => t.sgstTotal },
  { label: 'IGST', value: (t) => t.igstTotal },
  { label: 'Total GST', value: (t) => t.gstTotal },
  { label: 'Round-off', value: (t) => t.roundOff },
  { label: 'Net sales', value: (t) => t.netSales },
  { label: 'Cash', value: (t) => t.cash },
  { label: 'UPI', value: (t) => t.upi },
  { label: 'Card', value: (t) => t.card },
];

/**
 * Sales Report: totals of completed bills for a period (default: this month), day by day, with
 * the bills behind each day. Administrators only.
 */
@Component({
  selector: 'app-sales-report-page',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    Icon,
    PageHeader,
    SegmentedControl,
    EmptyState,
    ErrorState,
    PeriodBills,
    PeriodPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-report-page.html',
  styleUrl: './sales-report-page.scss',
})
export class SalesReportPage {
  private readonly reports = inject(ReportService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly printedAt = new Date();

  /** The period on screen. */
  protected readonly range = signal<DateRange>(presetRange('thisMonth'));
  protected readonly periodDays = computed(() => daysInRange(this.range()));

  protected readonly report = signal<SalesReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private requestId = 0;

  protected readonly viewControl = new FormControl<ReportView>('days', { nonNullable: true });
  protected readonly view = signal<ReportView>('days');
  /** A day picked in the day-wise table: the bill-wise view then shows only that day. */
  protected readonly billsDay = signal<string | null>(null);
  protected readonly billsRange = computed<DateRange>(() => {
    const day = this.billsDay();
    return day ? { from: day, to: day } : this.range();
  });

  protected readonly tiles = computed<StatTile[]>(() => {
    const report = this.report();
    if (!report) {
      return [];
    }
    const t = report.totals;
    const discountShare = t.grossAmount ? (t.discountTotal / t.grossAmount) * 100 : 0;
    return [
      {
        label: 'Net sales',
        icon: 'graph-up',
        value: this.rupees(t.netSales),
        detail: `${report.days.length} of ${this.periodDays()} days had sales`,
      },
      {
        label: 'Bills',
        icon: 'receipt',
        value: this.number(t.billCount, '1.0-0'),
        detail: 'Completed bills only',
      },
      {
        label: 'Average bill',
        icon: 'receipt-cutoff',
        value: this.rupees(t.averageBill),
        detail: 'Net sales ÷ bills',
      },
      {
        label: 'Quantity sold',
        icon: 'bag',
        value: this.number(t.quantity, '1.0-3'),
        detail: 'Pieces and metres',
      },
      {
        label: 'Discount given',
        icon: 'percent',
        value: this.rupees(t.discountTotal),
        detail: `${this.number(discountShare, '1.0-1')}% of ${this.rupees(t.grossAmount)}`,
      },
      {
        label: 'GST collected',
        icon: 'bank',
        value: this.rupees(t.gstTotal),
        detail: `On taxable ${this.rupees(t.taxableTotal)}`,
      },
    ];
  });

  protected readonly payments = computed<PaymentRow[]>(() => {
    const totals = this.report()?.totals;
    if (!totals) {
      return [];
    }
    const all = totals.cash + totals.upi + totals.card;
    const row = (label: string, icon: IconName, amount: number): PaymentRow => ({
      label,
      icon,
      amount,
      share: all > 0 ? Math.max(0, (amount / all) * 100) : 0,
    });
    return [
      row('Cash', 'cash-coin', totals.cash),
      row('UPI', 'qr-code-scan', totals.upi),
      row('Card', 'credit-card', totals.card),
    ];
  });

  constructor() {
    effect(() => {
      const range = this.range();
      untracked(() => void this.load(range));
    });
    this.viewControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((view) => this.view.set(view));
  }

  // ---- Period ------------------------------------------------------------------------------------

  protected setRange(range: DateRange): void {
    this.billsDay.set(null);
    const current = this.range();
    if (current.from !== range.from || current.to !== range.to) {
      this.range.set(range);
    }
  }

  // ---- Views -------------------------------------------------------------------------------------

  /** Opens the bill-wise view for one day of the day-wise table. */
  protected showDay(date: string): void {
    this.billsDay.set(date);
    this.viewControl.setValue('bills');
  }

  protected showWholePeriod(): void {
    this.billsDay.set(null);
  }

  // ---- Data --------------------------------------------------------------------------------------

  protected reload(): void {
    void this.load(this.range());
  }

  /** Ignores answers to superseded requests (the period changed meanwhile). */
  private async load(range: DateRange): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const report = await firstValueFrom(this.reports.sales(range.from, range.to));
      if (id === this.requestId) {
        this.report.set(report);
      }
    } catch (error) {
      if (id === this.requestId) {
        this.error.set(toApiError(error).message);
      }
    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
      }
    }
  }

  // ---- Export / print ----------------------------------------------------------------------------

  protected exportCsv(): void {
    const report = this.report();
    if (!report) {
      return;
    }
    const amounts = (totals: SalesTotals) => CSV_COLUMNS.map((column) => column.value(totals));
    const rows: CsvValue[][] = [
      ['Date', ...CSV_COLUMNS.map((column) => column.label)],
      ...report.days.map((day) => [day.date, ...amounts(day)]),
      ['Total', ...amounts(report.totals)],
    ];
    downloadCsv(`sales-report_${report.from}_to_${report.to}.csv`, toCsv(rows));
  }

  /** Prints the report on A4: app chrome and controls are hidden (styles/_print.scss). */
  protected print(): void {
    printPage();
  }

  // ---- Formatting --------------------------------------------------------------------------------

  protected rangeLabel(range: DateRange): string {
    const format = (date: string) => formatDate(date, 'dd MMM y', this.locale);
    return range.from === range.to
      ? format(range.from)
      : `${format(range.from)} – ${format(range.to)}`;
  }

  /** ₹1,234.50 — negative amounts as −₹2.05. */
  protected rupees(amount: number): string {
    const sign = amount < 0 ? '−' : '';
    return `${sign}₹${formatNumber(Math.abs(amount), this.locale, '1.2-2')}`;
  }

  private number(value: number, digits: string): string {
    return formatNumber(value, this.locale, digits);
  }
}

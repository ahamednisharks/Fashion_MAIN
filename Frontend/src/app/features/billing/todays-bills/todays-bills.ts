import { DatePipe, DecimalPipe, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { SalesService } from '../../../core/data-access/sales.service';
import {
  PAYMENT_MODE_LABELS,
  SaleInvoice,
  SaleInvoiceSummary,
} from '../../../core/models/sale.model';
import { Icon } from '../../../shared/components/icon/icon';
import { Modal } from '../../../shared/components/modal/modal';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';

const PAGE_SIZE = 100;

/** Today's bills at a glance, with reprint. */
@Component({
  selector: 'app-todays-bills',
  imports: [Modal, Icon, DatePipe, DecimalPipe, EmptyState, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todays-bills.html',
  styleUrl: './todays-bills.scss',
})
export class TodaysBills {
  readonly closed = output<void>();
  readonly print = output<SaleInvoice>();

  private readonly sales = inject(SalesService);
  private readonly today = formatDate(new Date(), 'yyyy-MM-dd', inject(LOCALE_ID));

  protected readonly bills = signal<readonly SaleInvoiceSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly printingId = signal<string | null>(null);
  protected readonly todayLabel = new Date();
  protected readonly salesTotal = computed(
    () =>
      this.bills()
        .filter((bill) => bill.status === 'completed')
        .reduce((sum, bill) => sum + Math.round(bill.grandTotal * 100), 0) / 100,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.sales.listInvoices({ date: this.today, pageSize: PAGE_SIZE }),
      );
      this.bills.set(page.items);
      this.total.set(page.total);
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async reprint(bill: SaleInvoiceSummary): Promise<void> {
    this.printingId.set(bill.id);
    try {
      this.print.emit(await firstValueFrom(this.sales.getInvoice(bill.id)));
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.printingId.set(null);
    }
  }

  protected modes(bill: SaleInvoiceSummary): string {
    return bill.paymentModes.map((mode) => PAYMENT_MODE_LABELS[mode]).join(' + ') || '—';
  }
}

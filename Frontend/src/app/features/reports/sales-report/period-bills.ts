import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
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
import { Pagination } from '../../../shared/components/pagination/pagination';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { Receipt } from '../../billing/receipt/receipt';

/** Bills of a period (newest first, every status), with 80 mm reprint. */
@Component({
  selector: 'app-period-bills',
  imports: [DatePipe, DecimalPipe, Icon, Pagination, EmptyState, ErrorState, Receipt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-bills.html',
  styles: `
    .is-cancelled td {
      color: var(--c-text-3);
    }
  `,
})
export class PeriodBills {
  /** YYYY-MM-DD, included. */
  readonly from = input.required<string>();
  /** YYYY-MM-DD, included. */
  readonly to = input.required<string>();

  private readonly sales = inject(SalesService);
  private readonly injector = inject(Injector);
  private readonly receiptView = viewChild(Receipt);

  protected readonly bills = signal<readonly SaleInvoiceSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly printingId = signal<string | null>(null);
  protected readonly receipt = signal<SaleInvoice | null>(null);
  private requestId = 0;

  constructor() {
    // A new period starts again from the first page.
    effect(() => {
      const from = this.from();
      const to = this.to();
      untracked(() => {
        this.page.set(1);
        void this.load(from, to);
      });
    });
  }

  protected reload(): void {
    void this.load(this.from(), this.to());
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    this.reload();
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.reload();
  }

  protected async reprint(bill: SaleInvoiceSummary): Promise<void> {
    this.printingId.set(bill.id);
    try {
      const invoice = await firstValueFrom(this.sales.getInvoice(bill.id));
      this.receipt.set(invoice);
      afterNextRender(() => void this.receiptView()?.print(), { injector: this.injector });
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.printingId.set(null);
    }
  }

  protected modes(bill: SaleInvoiceSummary): string {
    return bill.paymentModes.map((mode) => PAYMENT_MODE_LABELS[mode]).join(' + ') || '—';
  }

  /** Ignores answers to superseded requests (the period or page changed meanwhile). */
  private async load(from: string, to: string): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.sales.listInvoices({ from, to, page: this.page(), pageSize: this.pageSize() }),
      );
      if (id === this.requestId) {
        this.bills.set(result.items);
        this.total.set(result.total);
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
}

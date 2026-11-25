import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../core/data-access/api.types';
import { ShopSettingsService } from '../../core/data-access/shop-settings.service';
import { StockAdjustmentService } from '../../core/data-access/stock-adjustment.service';
import { itemDetails } from '../../core/models/sale.model';
import { ShopProfile } from '../../core/models/shop-profile.model';
import {
  ADJUSTMENT_MODE_LABELS,
  ADJUSTMENT_REASON_LABELS,
  ADJUSTMENT_STATUS_LABELS,
  StockAdjustment,
} from '../../core/models/stock-adjustment.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ErrorState } from '../../shared/components/state-views/state-views';
import { imagesReady, printPage } from '../../shared/print/print-page';
import { downloadStockAdjustmentPdf } from './adjustment-pdf';
import { adjustmentStatusBadge } from './adjustment-status';

/**
 * A stock adjustment as a document (A4 when printed): reason, each item's stock before, the
 * count, the change and its value. Posted adjustments can be cancelled (the stock change is
 * reversed). `?print=1` prints at once, `?pdf=1` downloads the PDF.
 */
@Component({
  selector: 'app-adjustment-view-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Icon, PageHeader, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustment-view-page.html',
  styleUrls: ['../purchase/orders/po-view-page.scss', './adjustment-view-page.scss'],
})
export class AdjustmentViewPage {
  /** Route parameter. */
  readonly id = input.required<string>();
  /** Query parameter: print as soon as the adjustment is shown. */
  readonly print = input<string>();
  /** Query parameter: download the PDF as soon as the document is shown. */
  readonly pdf = input<string>();

  private readonly adjustments = inject(StockAdjustmentService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly shopSettings = inject(ShopSettingsService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly adjustment = signal<StockAdjustment | null>(null);
  protected readonly shop = signal<ShopProfile | null>(null);
  protected readonly logo = this.shopSettings.logo;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelling = signal(false);
  protected readonly downloading = signal(false);

  protected readonly reasonLabels = ADJUSTMENT_REASON_LABELS;
  protected readonly modeLabels = ADJUSTMENT_MODE_LABELS;
  protected readonly statusLabels = ADJUSTMENT_STATUS_LABELS;
  protected readonly statusBadge = adjustmentStatusBadge;
  protected readonly itemDetails = itemDetails;
  protected readonly posted = computed(() => this.adjustment()?.status === 'posted');
  protected readonly netValue = computed(() => {
    const adjustment = this.adjustment();
    return adjustment ? Math.round((adjustment.valueIn - adjustment.valueOut) * 100) / 100 : 0;
  });
  protected readonly shopAddress = computed(() => {
    const shop = this.shop();
    if (!shop) return '';
    const cityLine = [shop.city, shop.pincode].filter(Boolean).join(' - ');
    return [shop.address, cityLine, shop.state].filter(Boolean).join(', ');
  });

  constructor() {
    this.shopSettings
      .getProfile()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (profile) => this.shop.set(profile), error: () => {} });
    void this.shopSettings.loadLogo();

    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  protected async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [adjustment] = await Promise.all([
        firstValueFrom(this.adjustments.get(id)),
        // Printing straight away (?print=1) waits for the logo too.
        this.shopSettings.loadLogo(),
      ]);
      this.adjustment.set(adjustment);
      if (this.print()) {
        // Drop ?print=1 so a refresh does not print again, then print once rendered.
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        afterNextRender(() => void this.printAdjustment(), { injector: this.injector });
      } else if (this.pdf()) {
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        void this.downloadPdf(adjustment);
      }
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Saves the document as a PDF file (same layout as the A4 print). */
  protected async downloadPdf(adjustment: StockAdjustment): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const [shop, logo] = await Promise.all([
        this.shop() ?? firstValueFrom(this.shopSettings.getProfile()).catch(() => null),
        this.shopSettings.loadLogo(),
      ]);
      await downloadStockAdjustmentPdf(adjustment, { shop, logo, locale: this.locale });
    } catch (error) {
      this.toast.error(
        `Couldn't create the PDF of ${adjustment.adjNo}: ${toApiError(error).message}`,
      );
    } finally {
      this.downloading.set(false);
    }
  }

  protected async printAdjustment(): Promise<void> {
    await imagesReady(this.host);
    printPage();
  }

  protected async cancelAdjustment(adjustment: StockAdjustment): Promise<void> {
    const confirmed = await this.confirm.confirm({
      tone: 'danger',
      title: `Cancel ${adjustment.adjNo}?`,
      message:
        'The adjustment is kept for your records, but its stock changes are reversed: ' +
        `${adjustment.quantityIn ? `${adjustment.quantityIn} added ` : ''}` +
        `${adjustment.quantityIn && adjustment.quantityOut ? 'and ' : ''}` +
        `${adjustment.quantityOut ? `${adjustment.quantityOut} taken out ` : ''}` +
        `${adjustment.quantityIn || adjustment.quantityOut ? 'are undone.' : 'nothing changes (every count matched).'}` +
        ' Enter a new adjustment if the stock still needs correcting.',
      confirmLabel: 'Cancel adjustment',
      cancelLabel: 'Keep it',
    });
    if (!confirmed) return;
    this.cancelling.set(true);
    try {
      this.adjustment.set(await firstValueFrom(this.adjustments.cancel(adjustment.id)));
      this.toast.success(`${adjustment.adjNo} cancelled — stock changes reversed.`);
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.cancelling.set(false);
    }
  }

  protected absolute(value: number): number {
    return Math.abs(value);
  }

  protected after(item: { systemQuantity: number; quantity: number }): number {
    return Math.round((item.systemQuantity + item.quantity) * 1000) / 1000;
  }
}

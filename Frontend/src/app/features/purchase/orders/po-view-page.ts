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

import { toApiError } from '../../../core/data-access/api.types';
import { PurchaseEntryService } from '../../../core/data-access/purchase-entry.service';
import { PurchaseOrderService } from '../../../core/data-access/purchase-order.service';
import { ShopSettingsService } from '../../../core/data-access/shop-settings.service';
import {
  PO_STATUS_LABELS,
  PoItem,
  PurchaseOrder,
  isPoEditable,
} from '../../../core/models/purchase-order.model';
import { PE_STATUS_LABELS, PeSummary } from '../../../core/models/purchase-entry.model';
import { ShopProfile } from '../../../core/models/shop-profile.model';
import { itemDetails } from '../../../core/models/sale.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../../../shared/components/icon/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ErrorState } from '../../../shared/components/state-views/state-views';
import { imagesReady, printPage } from '../../../shared/print/print-page';
import { peStatusBadge } from '../entries/pe-status';
import { downloadPurchaseOrderPdf } from '../shared/purchase-pdf';
import { poStatusBadge } from './po-status';

/**
 * A purchase order as a document (A4 when printed): shop and supplier details, lines, GST
 * breakup and terms. Open POs can be edited or cancelled from here, and open / partly received
 * ones received (Purchase Entry); the entries made against the PO are listed below it.
 * `?print=1` prints at once.
 */
@Component({
  selector: 'app-po-view-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Icon, PageHeader, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './po-view-page.html',
  styleUrl: './po-view-page.scss',
})
export class PoViewPage {
  /** Route parameter. */
  readonly id = input.required<string>();
  /** Query parameter: print as soon as the PO is shown (after "Save & Print"). */
  readonly print = input<string>();
  /** Query parameter: download the PDF as soon as the document is shown. */
  readonly pdf = input<string>();

  private readonly orders = inject(PurchaseOrderService);
  private readonly entryService = inject(PurchaseEntryService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly shopSettings = inject(ShopSettingsService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly po = signal<PurchaseOrder | null>(null);
  protected readonly shop = signal<ShopProfile | null>(null);
  protected readonly logo = this.shopSettings.logo;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelling = signal(false);
  protected readonly downloading = signal(false);
  /** Purchase entries made against this PO (newest first). */
  protected readonly entries = signal<readonly PeSummary[]>([]);
  protected readonly entriesError = signal<string | null>(null);

  protected readonly statusLabels = PO_STATUS_LABELS;
  protected readonly entryStatusLabels = PE_STATUS_LABELS;
  protected readonly entryStatusBadge = peStatusBadge;
  protected readonly statusBadge = poStatusBadge;
  protected readonly itemDetails = itemDetails;
  protected readonly editable = computed(() => {
    const po = this.po();
    return !!po && isPoEditable(po);
  });
  /** Goods can still be received against open and partly received POs. */
  protected readonly receivable = computed(() => {
    const status = this.po()?.status;
    return status === 'open' || status === 'partial';
  });
  /** Show the Received column once anything has been received. */
  protected readonly showReceived = computed(
    () => !!this.po()?.items.some((item) => item.receivedQuantity > 0),
  );
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
      const [po] = await Promise.all([
        firstValueFrom(this.orders.get(id)),
        // Printing straight away (?print=1) waits for the logo too.
        this.shopSettings.loadLogo(),
      ]);
      this.po.set(po);
      void this.loadEntries(po.id);
      if (this.print()) {
        // Drop ?print=1 so a refresh does not print again, then print once rendered.
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        afterNextRender(() => void this.printPo(), { injector: this.injector });
      } else if (this.pdf()) {
        // Same for ?pdf=1 (the list's download button).
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        void this.downloadPdf(po);
      }
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadEntries(poId: string): Promise<void> {
    this.entriesError.set(null);
    try {
      const page = await firstValueFrom(
        this.entryService.list({ purchaseOrderId: poId, pageSize: 50 }),
      );
      this.entries.set(page.items);
    } catch (error) {
      this.entries.set([]);
      this.entriesError.set(toApiError(error).message);
    }
  }

  /** Saves the document as a PDF file (same layout as the A4 print). */
  protected async downloadPdf(po: PurchaseOrder): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const [shop, logo] = await Promise.all([
        this.shop() ?? firstValueFrom(this.shopSettings.getProfile()).catch(() => null),
        this.shopSettings.loadLogo(),
      ]);
      await downloadPurchaseOrderPdf(po, { shop, logo, locale: this.locale });
    } catch (error) {
      this.toast.error(`Couldn't create the PDF of ${po.poNo}: ${toApiError(error).message}`);
    } finally {
      this.downloading.set(false);
    }
  }

  protected async printPo(): Promise<void> {
    await imagesReady(this.host);
    printPage();
  }

  protected async cancelPo(po: PurchaseOrder): Promise<void> {
    const confirmed = await this.confirm.confirm({
      tone: 'danger',
      title: `Cancel ${po.poNo}?`,
      message:
        'The purchase order is kept for your records but can no longer be changed or received.',
      confirmLabel: 'Cancel PO',
      cancelLabel: 'Keep PO',
    });
    if (!confirmed) return;
    this.cancelling.set(true);
    try {
      this.po.set(await firstValueFrom(this.orders.cancel(po.id)));
      this.toast.success(`${po.poNo} cancelled.`);
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.cancelling.set(false);
    }
  }

  /** Still to come on a line (never below 0 — more than ordered may be received). */
  protected pendingOf(item: PoItem): number {
    return Math.max(0, Math.round((item.quantity - item.receivedQuantity) * 1000) / 1000);
  }

  protected gstPercent(item: PoItem): string {
    return `${item.gstRate}%`;
  }

  protected taxOf(item: PoItem): number {
    return Math.round((item.cgstAmount + item.sgstAmount + item.igstAmount) * 100) / 100;
  }
}

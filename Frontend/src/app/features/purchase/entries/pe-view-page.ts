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
import { ShopSettingsService } from '../../../core/data-access/shop-settings.service';
import { PE_STATUS_LABELS, PeItem, PurchaseEntry } from '../../../core/models/purchase-entry.model';
import { ShopProfile } from '../../../core/models/shop-profile.model';
import { itemDetails } from '../../../core/models/sale.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../../../shared/components/icon/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ErrorState } from '../../../shared/components/state-views/state-views';
import { imagesReady, printPage } from '../../../shared/print/print-page';
import { LabelQueue } from '../../barcodes/label-queue';
import { downloadPurchaseEntryPdf } from '../shared/purchase-pdf';
import { peStatusBadge } from './pe-status';

/**
 * A purchase entry as a document (A4 when printed): shop and supplier, supplier invoice, the
 * PO it was received against, lines with the prices set, GST breakup. Saved entries can be
 * edited, cancelled or sent to Barcode Assign for labels. `?print=1` prints at once.
 */
@Component({
  selector: 'app-pe-view-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Icon, PageHeader, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pe-view-page.html',
  styleUrls: ['../orders/po-view-page.scss', './pe-view-page.scss'],
})
export class PeViewPage {
  /** Route parameter. */
  readonly id = input.required<string>();
  /** Query parameter: print as soon as the entry is shown. */
  readonly print = input<string>();
  /** Query parameter: download the PDF as soon as the document is shown. */
  readonly pdf = input<string>();

  private readonly entries = inject(PurchaseEntryService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly labelQueue = inject(LabelQueue);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly shopSettings = inject(ShopSettingsService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly entry = signal<PurchaseEntry | null>(null);
  protected readonly shop = signal<ShopProfile | null>(null);
  protected readonly logo = this.shopSettings.logo;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelling = signal(false);
  protected readonly downloading = signal(false);
  protected readonly labelling = signal(false);

  protected readonly statusLabels = PE_STATUS_LABELS;
  protected readonly statusBadge = peStatusBadge;
  protected readonly itemDetails = itemDetails;
  protected readonly posted = computed(() => this.entry()?.status === 'posted');
  /** Supplier's bill total minus the entry total (null when no bill total was typed). */
  protected readonly billDifference = computed(() => {
    const entry = this.entry();
    if (!entry || entry.billAmount === null) return null;
    return Math.round((entry.billAmount - entry.grandTotal) * 100) / 100;
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
      const [entry] = await Promise.all([
        firstValueFrom(this.entries.get(id)),
        // Printing straight away (?print=1) waits for the logo too.
        this.shopSettings.loadLogo(),
      ]);
      this.entry.set(entry);
      if (this.print()) {
        // Drop ?print=1 so a refresh does not print again, then print once rendered.
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        afterNextRender(() => void this.printEntry(), { injector: this.injector });
      } else if (this.pdf()) {
        // Same for ?pdf=1 (the list's download button).
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        void this.downloadPdf(entry);
      }
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Saves the document as a PDF file (same layout as the A4 print). */
  protected async downloadPdf(entry: PurchaseEntry): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const [shop, logo] = await Promise.all([
        this.shop() ?? firstValueFrom(this.shopSettings.getProfile()).catch(() => null),
        this.shopSettings.loadLogo(),
      ]);
      await downloadPurchaseEntryPdf(entry, { shop, logo, locale: this.locale });
    } catch (error) {
      this.toast.error(`Couldn't create the PDF of ${entry.peNo}: ${toApiError(error).message}`);
    } finally {
      this.downloading.set(false);
    }
  }

  protected async printEntry(): Promise<void> {
    await imagesReady(this.host);
    printPage();
  }

  /** Opens Barcode Assign with the entry's items, one label per piece received. */
  protected async printLabels(entry: PurchaseEntry): Promise<void> {
    this.labelling.set(true);
    try {
      const items = await firstValueFrom(this.entries.labels(entry.id));
      this.labelQueue.put(
        items,
        items.map((item) => item.copies),
      );
      await this.router.navigate(['/masters/barcodes']);
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.labelling.set(false);
    }
  }

  protected async cancelEntry(entry: PurchaseEntry): Promise<void> {
    const confirmed = await this.confirm.confirm({
      tone: 'danger',
      title: `Cancel ${entry.peNo}?`,
      message:
        'The entry is kept for your records but no longer counts as received' +
        (entry.poNo ? ` — ${entry.poNo} goes back to waiting for these goods.` : '.') +
        ' Item prices it set stay as they are.',
      confirmLabel: 'Cancel entry',
      cancelLabel: 'Keep entry',
    });
    if (!confirmed) return;
    this.cancelling.set(true);
    try {
      this.entry.set(await firstValueFrom(this.entries.cancel(entry.id)));
      this.toast.success(`${entry.peNo} cancelled.`);
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.cancelling.set(false);
    }
  }

  protected taxOf(item: PeItem): number {
    return Math.round((item.cgstAmount + item.sgstAmount + item.igstAmount) * 100) / 100;
  }

  protected absolute(value: number): number {
    return Math.abs(value);
  }
}

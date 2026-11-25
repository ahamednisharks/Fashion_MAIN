import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
} from '@angular/core';

import { ShopSettingsService } from '../../../core/data-access/shop-settings.service';
import { PAYMENT_MODE_LABELS, SaleInvoice, itemDetails } from '../../../core/models/sale.model';
import { imagesReady } from '../../../shared/print/print-page';

interface TaxRow {
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

const paise = (rupees: number) => Math.round(rupees * 100);

/**
 * 80 mm thermal receipt (tax invoice). Hidden on screen; print() moves it to <body> and adds the
 * `print-receipt` class there (see styles/_print.scss), so the print view can hide the whole app
 * around it. Used by Billing and by the Sales Report (reprints).
 */
@Component({
  selector: 'app-receipt',
  imports: [DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receipt.html',
  styleUrl: './receipt.scss',
  host: { class: 'receipt-print' },
})
export class Receipt {
  readonly invoice = input.required<SaleInvoice>();

  protected readonly itemDetails = itemDetails;
  protected readonly modeLabels = PAYMENT_MODE_LABELS;

  protected readonly sellerAddress = computed(() => {
    const seller = this.invoice().seller;
    const cityLine = [seller.city, seller.pincode].filter(Boolean).join(' - ');
    return [seller.address, cityLine, seller.state].filter(Boolean).join(', ');
  });

  /** GST breakup by rate, as required on a tax invoice. */
  protected readonly taxRows = computed<TaxRow[]>(() => {
    const rows = new Map<number, TaxRow>();
    for (const item of this.invoice().items) {
      const row = rows.get(item.gstRate) ?? {
        gstRate: item.gstRate,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      row.taxableValue = (paise(row.taxableValue) + paise(item.taxableValue)) / 100;
      row.cgst = (paise(row.cgst) + paise(item.cgstAmount)) / 100;
      row.sgst = (paise(row.sgst) + paise(item.sgstAmount)) / 100;
      row.igst = (paise(row.igst) + paise(item.igstAmount)) / 100;
      rows.set(item.gstRate, row);
    }
    return [...rows.values()].sort((a, b) => a.gstRate - b.gstRate);
  });

  /** MRP value minus the amount paid ("You saved"). */
  protected readonly savings = computed(() => {
    const invoice = this.invoice();
    const mrpTotal = invoice.items.reduce(
      (sum, item) => sum + Math.round(paise(item.mrp) * item.quantity),
      0,
    );
    return Math.max(0, mrpTotal - paise(invoice.grandTotal)) / 100;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly settings = inject(ShopSettingsService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  /** The current shop logo (bills keep a snapshot of the shop details, but not of the logo). */
  protected readonly logo = this.settings.logo;

  constructor() {
    // Once moved, Angular no longer removes the element with the page — do it here.
    inject(DestroyRef).onDestroy(() => this.host.remove());
    void this.settings.loadLogo();
  }

  /**
   * Makes the receipt a direct child of <body> (call after it has rendered — Angular inserts
   * the element into the page after the constructor runs).
   */
  moveToBody(): void {
    if (this.host.parentElement !== document.body) {
      document.body.appendChild(this.host);
    }
  }

  /**
   * Prints this receipt on its own (call after it has rendered with the bill): the rest of the
   * app is hidden while the print dialog is open. `afterPrint` runs once the dialog closes.
   */
  async print(afterPrint?: () => void): Promise<void> {
    this.moveToBody();
    // Wait for the logo (normally loaded long before) so the bill does not print without it.
    await this.settings.loadLogo();
    this.changeDetector.detectChanges();
    await imagesReady(this.host);
    const body = document.body;
    body.classList.add('print-receipt');
    const done = () => {
      body.classList.remove('print-receipt');
      afterPrint?.();
    };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
  }
}

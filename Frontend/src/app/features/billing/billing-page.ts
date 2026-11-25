import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../core/data-access/api.types';
import { SalesService } from '../../core/data-access/sales.service';
import { ShopSettingsService } from '../../core/data-access/shop-settings.service';
import { PaymentMode, SaleInvoice, SellableItem, itemDetails } from '../../core/models/sale.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { PageHeader } from '../../shared/components/page-header/page-header';
import {
  SegmentOption,
  SegmentedControl,
} from '../../shared/components/segmented-control/segmented-control';
import { HasUnsavedChanges } from '../../shared/guards/unsaved-changes.guard';
import { errorBeep } from './beep';
import { formatRupees } from './bill-calculator';
import {
  BillLineView,
  BillStore,
  MAX_QUANTITY,
  PaymentChoice,
  QUANTITY_MESSAGES,
} from './bill-store';
import { CustomerPicker } from './customer-picker/customer-picker';
import { ItemSearch } from './item-search/item-search';
import { Receipt } from './receipt/receipt';
import { TodaysBills } from './todays-bills/todays-bills';

const PAYMENT_OPTIONS: readonly SegmentOption<PaymentChoice>[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'split', label: 'Split' },
];

const SPLIT_MODES: readonly { mode: PaymentMode; label: string }[] = [
  { mode: 'cash', label: 'Cash' },
  { mode: 'upi', label: 'UPI' },
  { mode: 'card', label: 'Card' },
];

/** "items.2.unitPrice" → 2 */
function lineIndexOf(field: string | undefined, name: string): number | null {
  const match = new RegExp(`^items\\.(\\d+)\\.${name}$`).exec(field ?? '');
  return match ? Number(match[1]) : null;
}

/** "1,500" → 1500; blank or invalid → null (cash: exact amount). */
function parseAmount(text: string): number | null {
  const value = text.trim().replace(/,/g, '');
  if (!value) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Counter billing. Staff scan a barcode (or type and pick an item from the list), the item is
 * added to the bill table, and adding the same item again increases its quantity.
 */
@Component({
  selector: 'app-billing-page',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    Icon,
    SegmentedControl,
    ItemSearch,
    CustomerPicker,
    Receipt,
    TodaysBills,
  ],
  providers: [BillStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './billing-page.html',
  styleUrls: ['./billing-page.scss', './billing-summary.scss'],
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export class BillingPage implements HasUnsavedChanges {
  protected readonly store = inject(BillStore);
  private readonly sales = inject(SalesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly injector = inject(Injector);

  private readonly search = viewChild.required(ItemSearch);
  private readonly customerPicker = viewChild(CustomerPicker);
  private readonly receiptView = viewChild(Receipt);

  protected readonly available = this.sales.available;
  protected readonly paymentOptions = PAYMENT_OPTIONS;
  protected readonly splitModes = SPLIT_MODES;
  protected readonly maxQuantity = MAX_QUANTITY;
  protected readonly itemDetails = itemDetails;
  /** Payment inputs (form controls so typing is never overwritten while the bill re-renders). */
  protected readonly paymentForm = new FormGroup({
    mode: new FormControl<PaymentChoice>('cash', { nonNullable: true }),
    cash: new FormControl('', { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true }),
    split: new FormGroup({
      cash: new FormControl('', { nonNullable: true }),
      upi: new FormControl('', { nonNullable: true }),
      card: new FormControl('', { nonNullable: true }),
    }),
  });

  /** The save in progress: 'save' (Save, F8) or 'print' (Save & Print, F9); null when idle. */
  protected readonly saving = signal<'save' | 'print' | null>(null);
  protected readonly saveError = signal<string | null>(null);
  /** The bill saved last (shown in the "saved" bar with a print button). */
  protected readonly lastInvoice = signal<SaleInvoice | null>(null);
  /** The bill saved last has been printed (its button then says "Print again"). */
  protected readonly lastPrinted = signal(false);
  /** The bill currently rendered for printing. */
  protected readonly receipt = signal<SaleInvoice | null>(null);
  protected readonly showTodaysBills = signal(false);
  protected readonly shopNameMissing = signal(false);

  constructor() {
    this.paymentForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncPayment());

    inject(ShopSettingsService)
      .getProfile()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (profile) => {
          this.store.shopState.set(profile.state);
          this.shopNameMissing.set(!profile.shopName);
        },
        // Bills still work without the profile (CGST + SGST); the server snapshots it anyway.
        error: () => undefined,
      });

    afterNextRender(() => this.search().focus());
  }

  hasUnsavedChanges(): boolean {
    return !this.store.isEmpty();
  }

  // ---- Items -------------------------------------------------------------------------------------

  protected addItem(item: SellableItem): void {
    const result = this.store.add(item);
    if (!result.added) {
      this.toast.warning(`Quantity cannot be more than ${MAX_QUANTITY}.`);
    }
    this.saveError.set(null);
    this.revealLine(this.store.lastTouchedKey());
  }

  protected commitQuantity(line: BillLineView, field: HTMLInputElement): void {
    const value = Number(field.value.replace(',', '.'));
    if (value === line.quantity) {
      return;
    }
    const problem = this.store.setQuantity(line.key, value);
    if (problem) {
      field.value = String(line.quantity);
      this.toast.warning(QUANTITY_MESSAGES[problem]);
      errorBeep();
    }
  }

  protected commitDiscount(line: BillLineView, field: HTMLInputElement): void {
    const raw = field.value.trim();
    this.store.setDiscount(line.key, raw ? Number(raw.replace(',', '.')) : 0);
    // Show the clamped / rounded value the bill actually uses.
    const applied = this.store.lines().find((candidate) => candidate.key === line.key);
    field.value = applied?.discountPercent ? String(applied.discountPercent) : '';
  }

  /** Enter in a quantity / discount box: apply it and go back to scanning. */
  protected commitAndScan(field: HTMLInputElement): void {
    field.blur();
    this.search().focus();
  }

  protected removeLine(line: BillLineView): void {
    this.store.remove(line.key);
    this.search().focus();
  }

  /** Hover text for the GST cell: "CGST 2.5% ₹40.43 + SGST 2.5% ₹40.43". */
  protected gstTitle(line: BillLineView): string {
    const { gstRate } = line.item;
    const { cgstAmount, sgstAmount, igstAmount } = line.amounts;
    if (this.store.supplyType() === 'inter') {
      return `IGST ${gstRate}% ₹${formatRupees(igstAmount)}`;
    }
    const half = gstRate / 2;
    return `CGST ${half}% ₹${formatRupees(cgstAmount)} + SGST ${half}% ₹${formatRupees(sgstAmount)}`;
  }

  protected lineLabel(line: BillLineView): string {
    const details = itemDetails(line.item);
    return details ? `${line.item.productName} (${details})` : line.item.productName;
  }

  // ---- Payment ----------------------------------------------------------------------------------

  private syncPayment(): void {
    const value = this.paymentForm.getRawValue();
    this.store.paymentChoice.set(value.mode);
    this.store.cashTendered.set(parseAmount(value.cash));
    this.store.paymentReference.set(value.reference);
    for (const { mode } of SPLIT_MODES) {
      this.store.setSplitAmount(mode, parseAmount(value.split[mode]));
    }
  }

  // ---- Save / print -----------------------------------------------------------------------------

  /** Saves the bill; `print` false is the Save button (F8), true is Save & Print (F9). */
  protected async save(print = true): Promise<void> {
    if (this.saving() || this.store.isEmpty()) {
      return;
    }
    const settlement = this.store.settlement();
    if (!settlement.ok) {
      this.saveError.set(settlement.message);
      errorBeep();
      return;
    }

    this.saving.set(print ? 'print' : 'save');
    this.saveError.set(null);
    try {
      const invoice = await firstValueFrom(this.sales.createInvoice(this.store.toInput()));
      this.lastInvoice.set(invoice);
      this.lastPrinted.set(false);
      this.startNewBill();
      this.toast.success(`Bill ${invoice.invoiceNo} saved.`);
      if (print) {
        this.print(invoice);
      }
    } catch (error) {
      const apiError = toApiError(error);
      this.saveError.set(apiError.message);
      errorBeep();
      await this.refreshChangedPrice(apiError.field);
    } finally {
      this.saving.set(null);
    }
  }

  protected print(invoice: SaleInvoice): void {
    if (invoice.id === this.lastInvoice()?.id) {
      this.lastPrinted.set(true);
    }
    this.receipt.set(invoice);
    // Print once the receipt has rendered with this bill.
    afterNextRender(() => void this.receiptView()?.print(() => this.search().focus()), {
      injector: this.injector,
    });
  }

  protected async clearBill(): Promise<void> {
    if (this.store.isEmpty()) {
      return;
    }
    const confirmed = await this.confirm.confirm({
      tone: 'warning',
      title: 'Clear this bill?',
      message: 'All items on the current bill will be removed.',
      confirmLabel: 'Clear bill',
      cancelLabel: 'Keep bill',
    });
    if (confirmed) {
      this.startNewBill();
    }
  }

  protected reprintFromList(invoice: SaleInvoice): void {
    this.showTodaysBills.set(false);
    this.print(invoice);
  }

  // ---- Keyboard ---------------------------------------------------------------------------------

  protected onShortcut(event: KeyboardEvent): void {
    // Dialogs (confirm, today's bills) handle their own keys.
    if (event.defaultPrevented || this.showTodaysBills() || this.confirm.current()) {
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      this.search().focus();
    } else if (event.key === 'F4') {
      event.preventDefault();
      this.customerPicker()?.focus();
    } else if (event.key === 'F8') {
      event.preventDefault();
      void this.save(false);
    } else if (event.key === 'F9' || (event.key === 'Enter' && event.ctrlKey)) {
      event.preventDefault();
      void this.save(true);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !isEditable(event.target)
    ) {
      // A scanner "typing" while focus is on a button or the page: send it to the scan box.
      this.search().focus();
    }
  }

  // ---- Helpers ----------------------------------------------------------------------------------

  private startNewBill(): void {
    this.store.clear();
    this.paymentForm.reset();
    this.customerPicker()?.reset();
    this.saveError.set(null);
    this.search().focus();
  }

  /** The server refused a line because its price changed: load the new price into the bill. */
  private async refreshChangedPrice(field: string | undefined): Promise<void> {
    const index = lineIndexOf(field, 'unitPrice');
    const line = index === null ? undefined : this.store.lines()[index];
    if (!line) {
      return;
    }
    try {
      const fresh = await firstValueFrom(this.sales.lookup(line.item.sku));
      if (this.store.refreshItems(fresh)) {
        this.revealLine(line.key);
      }
    } catch {
      // Keep the server's message; staff can remove and re-scan the item.
    }
  }

  private revealLine(key: string | null): void {
    if (!key) {
      return;
    }
    afterNextRender(
      () =>
        document
          .querySelector(`[data-line-key="${CSS.escape(key)}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector },
    );
  }
}

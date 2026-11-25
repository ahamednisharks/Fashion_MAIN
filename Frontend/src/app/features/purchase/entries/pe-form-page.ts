import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { ITEM_SOURCE } from '../../../core/data-access/item-source';
import { PurchaseEntryService } from '../../../core/data-access/purchase-entry.service';
import { PurchaseOrderService } from '../../../core/data-access/purchase-order.service';
import { ShopSettingsService } from '../../../core/data-access/shop-settings.service';
import { PurchaseEntry, ReceivableOrder } from '../../../core/models/purchase-entry.model';
import {
  PO_STATUS_LABELS,
  PoSummary,
  PurchasableItem,
} from '../../../core/models/purchase-order.model';
import { SellableItem, itemDetails } from '../../../core/models/sale.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../../../shared/components/icon/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ErrorState } from '../../../shared/components/state-views/state-views';
import { HasUnsavedChanges } from '../../../shared/guards/unsaved-changes.guard';
import { QuantityProblem } from '../../billing/bill-store';
import { ItemSearch } from '../../billing/item-search/item-search';
import { LabelQueue } from '../../barcodes/label-queue';
import { isoDate } from '../../reports/date-range';
import { SUPPLIER_PICKER_HOST } from '../shared/purchase-supplier';
import { SupplierPicker } from '../shared/supplier-picker';
import { MAX_QUANTITY, PeLineView, PeStore, QUANTITY_MESSAGES } from './pe-store';

/** "1,234.50" / "" → number; "" → null; anything else → NaN. */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  return cleaned === '' ? null : Number(cleaned);
}

/** A PO the entry can be received against (option of the "Against PO" list). */
interface OrderOption {
  readonly id: string;
  readonly label: string;
}

/**
 * New / edit purchase entry. Usually starts from the purchase order the goods came against:
 * choosing it fills in the supplier and the PO's items still to come, which are then changed to
 * match what arrived. Without a PO: choose the supplier and scan / search the items (same as
 * Billing). Also the supplier invoice, rates (GST exclusive), discount, the MRP / selling price
 * to give the items, totals and the supplier's bill total as a check. `?po=<id>` starts a new
 * entry against that PO.
 */
@Component({
  selector: 'app-pe-form-page',
  imports: [DecimalPipe, RouterLink, Icon, PageHeader, ErrorState, ItemSearch, SupplierPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pe-form-page.html',
  styleUrls: ['../orders/po-form-page.scss', './pe-form-page.scss'],
  providers: [
    PeStore,
    { provide: SUPPLIER_PICKER_HOST, useExisting: PeStore },
    { provide: ITEM_SOURCE, useExisting: PurchaseOrderService },
  ],
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export class PeFormPage implements HasUnsavedChanges {
  /** Route parameter (edit mode). */
  readonly id = input<string>();
  /** Query parameter: start a new entry against this PO. */
  readonly po = input<string>();

  protected readonly store = inject(PeStore);
  private readonly entries = inject(PurchaseEntryService);
  private readonly labelQueue = inject(LabelQueue);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly injector = inject(Injector);
  private readonly itemSearch = viewChild(ItemSearch);
  private readonly supplierPicker = viewChild(SupplierPicker);

  protected readonly today = isoDate(new Date());
  protected readonly maxQuantity = MAX_QUANTITY;
  protected readonly itemDetails = itemDetails;
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  /** The entry being edited (null for a new one). */
  protected readonly existing = signal<PurchaseEntry | null>(null);
  /** Edit was opened for a cancelled entry. */
  protected readonly locked = signal(false);
  protected readonly nextNumber = signal<string | null>(null);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Last refused value per line / field, e.g. "rate:<key>" → message. */
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  private saved = false;

  /** Open and partly received POs of every supplier. */
  private readonly receivable = signal<readonly PoSummary[]>([]);
  protected readonly ordersLoading = signal(true);
  protected readonly orderBusy = signal(false);
  private readonly ordersLoaded: Promise<void>;

  /** POs to receive against: all of them, or the chosen supplier's. */
  protected readonly orderOptions = computed<OrderOption[]>(() => {
    const supplierId = this.store.supplier()?.id;
    const options: OrderOption[] = this.receivable()
      .filter((order) => !supplierId || order.supplierId === supplierId)
      .map((order) => ({
        id: order.id,
        label: [
          order.poNo,
          supplierId ? '' : order.supplierName,
          formatDate(order.poDate),
          order.status === 'partial' ? PO_STATUS_LABELS.partial : '',
        ]
          .filter(Boolean)
          .join(' · '),
      }));
    const order = this.store.order();
    // The entry's own PO stays selectable even when it has been received in full.
    if (order && !options.some((option) => option.id === order.id)) {
      options.unshift({ id: order.id, label: `${order.poNo} · ${PO_STATUS_LABELS[order.status]}` });
    }
    return options;
  });

  protected readonly purchaseRate = (item: SellableItem) =>
    (item as PurchasableItem).purchasePrice ?? null;

  protected readonly heading = computed(() => {
    const entry = this.existing();
    return entry ? `Edit ${entry.peNo}` : 'New purchase entry';
  });

  constructor() {
    inject(ShopSettingsService)
      .getProfile()
      .pipe(takeUntilDestroyed())
      // Without the shop's state the entry uses CGST + SGST; the server decides anyway.
      .subscribe({ next: (profile) => this.store.shopState.set(profile.state), error: () => {} });

    this.ordersLoaded = this.loadOrders();

    effect(() => {
      const id = this.id();
      const po = this.po();
      untracked(() => void this.start(id, po));
    });

    // New entries show the number they will probably get (it depends on the received date).
    effect(() => {
      const date = this.store.entryDate();
      if (!this.isEdit() && date) {
        untracked(() => void this.loadNextNumber(date));
      }
    });

    // Another supplier drops the chosen PO (it belongs to the old one).
    effect(() => {
      const supplierId = this.store.supplier()?.id ?? '';
      untracked(() => {
        const order = this.store.order();
        if (order && order.supplierId !== supplierId) {
          this.store.setOrder(null);
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && !this.locked() && this.store.hasUnsavedChanges();
  }

  // ---- Loading -----------------------------------------------------------------------------------

  protected async start(id: string | undefined, po: string | undefined): Promise<void> {
    this.loadError.set(null);
    this.locked.set(false);
    if (!id) {
      this.existing.set(null);
      this.store.reset(this.today);
      if (po) {
        await this.startAgainstOrder(po);
      } else {
        // Start with the PO list when there are POs to receive, else with the supplier.
        await this.ordersLoaded;
        afterNextRender(
          () =>
            this.orderOptions().length ? this.focusOrderList() : this.supplierPicker()?.focus(),
          { injector: this.injector },
        );
      }
      return;
    }
    this.loading.set(true);
    try {
      const entry = await firstValueFrom(this.entries.get(id));
      const order = entry.purchaseOrderId
        ? await firstValueFrom(this.entries.receivableOrder(entry.purchaseOrderId))
        : null;
      this.existing.set(entry);
      this.locked.set(entry.status === 'cancelled');
      this.store.load(entry, order);
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** New entry from a PO ("Receive goods"): its supplier and its items still to come. */
  private async startAgainstOrder(poId: string): Promise<void> {
    this.loading.set(true);
    try {
      const order = await firstValueFrom(this.entries.receivableOrder(poId));
      this.setSupplierOf(order);
      if (order.status === 'cancelled' || order.status === 'received') {
        this.toast.warning(
          order.status === 'cancelled'
            ? `${order.poNo} is cancelled — goods cannot be received against it.`
            : `Everything on ${order.poNo} has already been received.`,
        );
      } else {
        this.store.setOrder(order);
      }
      this.store.markSaved();
      afterNextRender(() => this.focusInvoiceNo(), { injector: this.injector });
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadNextNumber(date: string): Promise<void> {
    try {
      this.nextNumber.set(await firstValueFrom(this.entries.nextNumber(date)));
    } catch {
      this.nextNumber.set(null);
    }
  }

  private async loadOrders(): Promise<void> {
    this.ordersLoading.set(true);
    try {
      this.receivable.set(await firstValueFrom(this.entries.receivableOrders()));
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.ordersLoading.set(false);
    }
  }

  // ---- Purchase order ------------------------------------------------------------------------------

  protected async chooseOrder(select: HTMLSelectElement): Promise<void> {
    const id = select.value;
    if (!id) {
      this.store.setOrder(null);
      return;
    }
    if (!(await this.loadOrder(id))) {
      select.value = this.store.order()?.id ?? '';
    }
  }

  /**
   * Receives against a PO: its supplier becomes the entry's supplier and its items still to
   * come are filled in. Items already on the entry are replaced (after asking) or kept.
   * Returns false when nothing changed.
   */
  protected async loadOrder(id: string): Promise<boolean> {
    if (id === this.store.order()?.id) return true;
    this.orderBusy.set(true);
    try {
      const order = await firstValueFrom(this.entries.receivableOrder(id));
      const count = this.store.lines().length;
      if (count) {
        const choice = await this.confirm.open({
          title: `Load the items of ${order.poNo}?`,
          message:
            `This entry already has ${count} ${count === 1 ? 'item' : 'items'}. Replace ` +
            `${count === 1 ? 'it' : 'them'} with what is still to come on ${order.poNo}, or ` +
            `keep ${count === 1 ? 'it' : 'them'} and add the PO items that are missing?`,
          confirmLabel: 'Replace items',
          alternateLabel: 'Keep and add',
          cancelLabel: 'Cancel',
        });
        if (choice === 'cancel') return false;
        if (choice === 'confirm') this.store.clearLines();
      }
      this.setSupplierOf(order);
      const added = this.store.setOrder(order);
      if (!added && !this.store.lines().length) {
        this.toast.warning(`Nothing is still to come on ${order.poNo}.`);
      }
      afterNextRender(
        () => (this.store.invoiceNo().trim() ? this.itemSearch()?.focus() : this.focusInvoiceNo()),
        { injector: this.injector },
      );
      return true;
    } catch (error) {
      this.toast.error(toApiError(error).message);
      return false;
    } finally {
      this.orderBusy.set(false);
    }
  }

  /** The PO's supplier (as on the PO) becomes the entry's supplier. */
  private setSupplierOf(order: ReceivableOrder): void {
    if (this.store.supplier()?.id === order.supplierId) return;
    this.store.supplier.set({
      id: order.supplierId,
      name: order.supplierName,
      mobile: order.supplierMobile,
      gstNumber: order.supplierGstNumber,
      state: order.supplierState,
      address: order.supplierAddress,
      // Only active suppliers can be chosen; the server checks the PO's supplier.
      status: 'active',
    });
  }

  private focusOrderList(): void {
    document.querySelector<HTMLSelectElement>('#pe-order')?.focus();
  }

  // ---- Lines ---------------------------------------------------------------------------------------

  protected addItem(item: SellableItem): void {
    const key = this.store.add(item as PurchasableItem);
    this.clearFieldError(`rate:${key}`);
    const line = this.store.lines().find((candidate) => candidate.key === key);
    // A new item without a known rate: put the cursor in its rate box.
    if (line && line.rate === null) {
      afterNextRender(
        () =>
          document
            .querySelector<HTMLInputElement>(`[data-line-key="${CSS.escape(key)}"] .rate-input`)
            ?.focus(),
        { injector: this.injector },
      );
    }
  }

  protected commitQuantity(line: PeLineView, box: HTMLInputElement): void {
    const value = parseNumber(box.value);
    const problem = this.store.setQuantity(line.key, value ?? NaN);
    this.showFieldResult(
      `qty:${line.key}`,
      problem && QUANTITY_MESSAGES[problem as QuantityProblem],
    );
    if (problem) box.value = String(line.quantity);
  }

  protected commitRate(line: PeLineView, box: HTMLInputElement): void {
    const problem = this.store.setRate(line.key, parseNumber(box.value));
    this.showFieldResult(`rate:${line.key}`, problem);
    if (problem) box.value = money(line.rate);
  }

  protected commitDiscount(line: PeLineView, box: HTMLInputElement): void {
    const problem = this.store.setDiscount(line.key, parseNumber(box.value) ?? 0);
    this.showFieldResult(`disc:${line.key}`, problem);
    if (problem) box.value = line.discountPercent ? String(line.discountPercent) : '';
  }

  protected commitMrp(line: PeLineView, box: HTMLInputElement): void {
    const problem = this.store.setMrp(line.key, parseNumber(box.value));
    this.showFieldResult(`mrp:${line.key}`, problem);
    if (problem) box.value = money(line.mrp);
  }

  protected commitSellingPrice(line: PeLineView, box: HTMLInputElement): void {
    const problem = this.store.setSellingPrice(line.key, parseNumber(box.value));
    this.showFieldResult(`sell:${line.key}`, problem);
    if (problem) box.value = money(line.sellingPrice);
  }

  /** Enter in a line box: save the value and go back to the scan box. */
  protected commitAndScan(box: HTMLInputElement): void {
    box.dispatchEvent(new Event('change'));
    this.itemSearch()?.focus();
  }

  protected removeLine(line: PeLineView): void {
    this.store.remove(line.key);
    this.itemSearch()?.focus();
  }

  protected lineLabel(line: PeLineView): string {
    const details = itemDetails(line.item);
    return details ? `${line.item.productName} (${details})` : line.item.productName;
  }

  protected fieldError(key: string): string | undefined {
    return this.fieldErrors()[key];
  }

  // ---- Header / bottom fields ----------------------------------------------------------------------

  protected setEntryDate(value: string): void {
    this.store.entryDate.set(value);
  }

  protected setInvoiceNo(value: string): void {
    this.store.invoiceNo.set(value);
  }

  protected setInvoiceDate(value: string): void {
    this.store.invoiceDate.set(value);
  }

  protected setNotes(value: string): void {
    this.store.notes.set(value);
  }

  protected commitBillAmount(box: HTMLInputElement): void {
    const value = parseNumber(box.value);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 9_999_999.99)) {
      this.showFieldResult('bill', 'Enter the total printed on the supplier invoice.');
      box.value = money(this.store.billAmount());
      return;
    }
    this.clearFieldError('bill');
    this.store.billAmount.set(value === null ? null : Math.round(value * 100) / 100);
  }

  protected focusInvoiceNo(): void {
    document.querySelector<HTMLInputElement>('#pe-invoice-no')?.focus();
  }

  protected focusItems(): void {
    this.itemSearch()?.focus();
  }

  // ---- Save --------------------------------------------------------------------------------------

  protected async save(printLabels: boolean): Promise<void> {
    this.attempted.set(true);
    this.saveError.set(null);
    const problem = this.store.problem();
    if (problem || this.saving()) {
      if (problem) this.saveError.set(problem);
      return;
    }
    this.saving.set(true);
    try {
      const input = this.store.toInput();
      const existing = this.existing();
      const entry = await firstValueFrom(
        existing ? this.entries.update(existing.id, input) : this.entries.create(input),
      );
      this.saved = true;
      this.store.markSaved();
      this.toast.success(`${entry.peNo} ${existing ? 'updated' : 'saved'}.`);
      if (printLabels && (await this.queueLabels(entry.id))) {
        await this.router.navigate(['/masters/barcodes']);
      } else {
        await this.router.navigate(['/purchase/entries', entry.id]);
      }
    } catch (error) {
      this.saveError.set(toApiError(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  /** Hands the entry's items (one label per piece) to Barcode Assign. */
  private async queueLabels(id: string): Promise<boolean> {
    try {
      const items = await firstValueFrom(this.entries.labels(id));
      this.labelQueue.put(
        items,
        items.map((item) => item.copies),
      );
      return true;
    } catch (error) {
      this.toast.error(`Labels: ${toApiError(error).message}`);
      return false;
    }
  }

  protected onShortcut(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      this.itemSearch()?.focus();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.save(false);
    }
  }

  private showFieldResult(key: string, message: string | null | undefined): void {
    if (message) {
      this.fieldErrors.update((errors) => ({ ...errors, [key]: message }));
    } else {
      this.clearFieldError(key);
    }
  }

  private clearFieldError(key: string): void {
    if (this.fieldErrors()[key]) {
      this.fieldErrors.update(({ [key]: _removed, ...rest }) => rest);
    }
  }
}

function money(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

/** '2026-11-24' → '24 Nov 2026'. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

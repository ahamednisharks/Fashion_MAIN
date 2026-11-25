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
import { PurchaseOrderService } from '../../../core/data-access/purchase-order.service';
import { ShopSettingsService } from '../../../core/data-access/shop-settings.service';
import {
  PurchasableItem,
  PurchaseOrder,
  isPoEditable,
} from '../../../core/models/purchase-order.model';
import { SellableItem, itemDetails } from '../../../core/models/sale.model';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../../../shared/components/icon/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ErrorState } from '../../../shared/components/state-views/state-views';
import { HasUnsavedChanges } from '../../../shared/guards/unsaved-changes.guard';
import { QuantityProblem } from '../../billing/bill-store';
import { ItemSearch } from '../../billing/item-search/item-search';
import { isoDate } from '../../reports/date-range';
import { MAX_QUANTITY, PoLineView, PoStore, QUANTITY_MESSAGES } from './po-store';
import { SUPPLIER_PICKER_HOST } from '../shared/purchase-supplier';
import { SupplierPicker } from '../shared/supplier-picker';

/** "1,234.50" / "" → number; "" → null; anything else → NaN. */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  return cleaned === '' ? null : Number(cleaned);
}

/**
 * New / edit purchase order: supplier, dates, items (scan or search — same as Billing; adding
 * the same item again increases its quantity), rates (GST exclusive), discount, totals.
 */
@Component({
  selector: 'app-po-form-page',
  imports: [DecimalPipe, RouterLink, Icon, PageHeader, ErrorState, ItemSearch, SupplierPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './po-form-page.html',
  styleUrl: './po-form-page.scss',
  providers: [
    PoStore,
    { provide: SUPPLIER_PICKER_HOST, useExisting: PoStore },
    { provide: ITEM_SOURCE, useExisting: PurchaseOrderService },
  ],
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export class PoFormPage implements HasUnsavedChanges {
  /** Route parameter (edit mode). */
  readonly id = input<string>();

  protected readonly store = inject(PoStore);
  private readonly orders = inject(PurchaseOrderService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly itemSearch = viewChild(ItemSearch);
  private readonly supplierPicker = viewChild(SupplierPicker);

  protected readonly today = isoDate(new Date());
  protected readonly maxQuantity = MAX_QUANTITY;
  protected readonly itemDetails = itemDetails;
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  /** The PO being edited (null for a new one). */
  protected readonly existing = signal<PurchaseOrder | null>(null);
  /** Edit was opened for a PO that can no longer be changed. */
  protected readonly locked = signal(false);
  protected readonly nextNumber = signal<string | null>(null);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Last refused value per line / field, e.g. "rate:<key>" → message. */
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  private saved = false;

  protected readonly purchaseRate = (item: SellableItem) =>
    (item as PurchasableItem).purchasePrice ?? null;

  protected readonly heading = computed(() => {
    const po = this.existing();
    return po ? `Edit ${po.poNo}` : 'New purchase order';
  });

  constructor() {
    inject(ShopSettingsService)
      .getProfile()
      .pipe(takeUntilDestroyed())
      // Without the shop's state the PO uses CGST + SGST; the server decides anyway.
      .subscribe({ next: (profile) => this.store.shopState.set(profile.state), error: () => {} });

    effect(() => {
      const id = this.id();
      untracked(() => void this.start(id));
    });

    // New POs show the number they will probably get (it depends on the PO date's year).
    effect(() => {
      const date = this.store.poDate();
      if (!this.isEdit() && date) {
        untracked(() => void this.loadNextNumber(date));
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && !this.locked() && this.store.hasUnsavedChanges();
  }

  // ---- Loading -----------------------------------------------------------------------------------

  protected async start(id: string | undefined): Promise<void> {
    this.loadError.set(null);
    this.locked.set(false);
    if (!id) {
      this.existing.set(null);
      this.store.reset(this.today);
      afterNextRender(() => this.supplierPicker()?.focus(), { injector: this.injector });
      return;
    }
    this.loading.set(true);
    try {
      const po = await firstValueFrom(this.orders.get(id));
      this.existing.set(po);
      this.locked.set(!isPoEditable(po));
      this.store.load(po);
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadNextNumber(date: string): Promise<void> {
    try {
      this.nextNumber.set(await firstValueFrom(this.orders.nextNumber(date)));
    } catch {
      this.nextNumber.set(null);
    }
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

  protected commitQuantity(line: PoLineView, box: HTMLInputElement): void {
    const value = parseNumber(box.value);
    const problem = this.store.setQuantity(line.key, value ?? NaN);
    this.showFieldResult(
      `qty:${line.key}`,
      problem && QUANTITY_MESSAGES[problem as QuantityProblem],
    );
    if (problem) box.value = String(line.quantity);
  }

  protected commitRate(line: PoLineView, box: HTMLInputElement): void {
    const problem = this.store.setRate(line.key, parseNumber(box.value));
    this.showFieldResult(`rate:${line.key}`, problem);
    if (problem) box.value = line.rate === null ? '' : line.rate.toFixed(2);
  }

  protected commitDiscount(line: PoLineView, box: HTMLInputElement): void {
    const problem = this.store.setDiscount(line.key, parseNumber(box.value) ?? 0);
    this.showFieldResult(`disc:${line.key}`, problem);
    if (problem) box.value = line.discountPercent ? String(line.discountPercent) : '';
  }

  /** Enter in a line box: save the value and go back to the scan box. */
  protected commitAndScan(box: HTMLInputElement): void {
    box.dispatchEvent(new Event('change'));
    this.itemSearch()?.focus();
  }

  protected removeLine(line: PoLineView): void {
    this.store.remove(line.key);
    this.itemSearch()?.focus();
  }

  protected lineLabel(line: PoLineView): string {
    const details = itemDetails(line.item);
    return details ? `${line.item.productName} (${details})` : line.item.productName;
  }

  protected fieldError(key: string): string | undefined {
    return this.fieldErrors()[key];
  }

  // ---- Header fields -----------------------------------------------------------------------------

  protected setPoDate(value: string): void {
    this.store.poDate.set(value);
  }

  protected setExpectedDate(value: string): void {
    this.store.expectedDate.set(value);
  }

  protected setNotes(value: string): void {
    this.store.notes.set(value);
  }

  protected focusItems(): void {
    this.itemSearch()?.focus();
  }

  // ---- Save --------------------------------------------------------------------------------------

  protected async save(print: boolean): Promise<void> {
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
      const po = await firstValueFrom(
        existing ? this.orders.update(existing.id, input) : this.orders.create(input),
      );
      this.saved = true;
      this.store.markSaved();
      this.toast.success(`${po.poNo} ${existing ? 'updated' : 'saved'}.`);
      await this.router.navigate(['/purchase/orders', po.id], {
        queryParams: print ? { print: 1 } : {},
      });
    } catch (error) {
      this.saveError.set(toApiError(error).message);
    } finally {
      this.saving.set(false);
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

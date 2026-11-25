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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, firstValueFrom, of } from 'rxjs';

import { toApiError } from '../../core/data-access/api.types';
import { BrandService } from '../../core/data-access/brand.service';
import { CategoryService } from '../../core/data-access/category.service';
import { ITEM_SOURCE } from '../../core/data-access/item-source';
import { PurchaseOrderService } from '../../core/data-access/purchase-order.service';
import {
  AdjustmentItemsQuery,
  StockAdjustmentService,
} from '../../core/data-access/stock-adjustment.service';
import { StockService } from '../../core/data-access/stock.service';
import { PurchasableItem } from '../../core/models/purchase-order.model';
import { SellableItem, itemDetails } from '../../core/models/sale.model';
import {
  ADJUSTMENT_DIRECTION,
  ADJUSTMENT_MODE_LABELS,
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  AdjustmentMode,
  AdjustmentReason,
} from '../../core/models/stock-adjustment.model';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { PageHeader } from '../../shared/components/page-header/page-header';
import {
  SegmentOption,
  SegmentedControl,
} from '../../shared/components/segmented-control/segmented-control';
import { HasUnsavedChanges } from '../../shared/guards/unsaved-changes.guard';
import { ItemSearch } from '../billing/item-search/item-search';
import { isoDate } from '../reports/date-range';
import { AdjLineView, AdjustmentStore, MAX_QUANTITY } from './adjustment-store';

/** "1,234.50" / "-2" → number; "" → null; anything else → NaN. */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').replace(/−/g, '-').trim();
  return cleaned === '' ? null : Number(cleaned);
}

/** Everything "Load items" can add at once (the select's option values). */
interface LoadChoice {
  readonly value: string;
  readonly label: string;
  readonly query: AdjustmentItemsQuery;
}

const MODE_OPTIONS: readonly SegmentOption<AdjustmentMode>[] = [
  { value: 'count', label: ADJUSTMENT_MODE_LABELS.count },
  { value: 'change', label: ADJUSTMENT_MODE_LABELS.change },
];

/**
 * New stock adjustment. Count mode: scan every piece (each scan counts one) or type the count;
 * the stock changes by counted − in stock. Add / remove mode: type + / − per item (damaged,
 * lost, found…). Whole categories / brands or every below-zero item can be loaded at once.
 * `?reason=opening_stock` picks the reason; `?preset=below-zero` also loads the items whose
 * stock is below zero (sold before they were entered).
 */
@Component({
  selector: 'app-adjustment-form-page',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    Icon,
    PageHeader,
    ItemSearch,
    SegmentedControl,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustment-form-page.html',
  styleUrls: ['../purchase/orders/po-form-page.scss', './adjustment-form-page.scss'],
  providers: [AdjustmentStore, { provide: ITEM_SOURCE, useExisting: PurchaseOrderService }],
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export class AdjustmentFormPage implements HasUnsavedChanges {
  /** Query parameter: start with this reason. */
  readonly reason = input<string>();
  /** Query parameter: 'below-zero' loads every item whose stock is below zero. */
  readonly preset = input<string>();

  protected readonly store = inject(AdjustmentStore);
  private readonly adjustments = inject(StockAdjustmentService);
  private readonly stock = inject(StockService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly itemSearch = viewChild(ItemSearch);

  protected readonly today = isoDate(new Date());
  protected readonly maxQuantity = MAX_QUANTITY;
  protected readonly itemDetails = itemDetails;
  protected readonly reasons = ADJUSTMENT_REASONS;
  protected readonly reasonLabels = ADJUSTMENT_REASON_LABELS;
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly modeControl = new FormControl<AdjustmentMode>('count', { nonNullable: true });

  protected readonly nextNumber = signal<string | null>(null);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly loadingItems = signal(false);
  /** Last refused value per line / field, e.g. "qty:<key>" → message. */
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  private saved = false;

  private readonly categories = toSignal(
    inject(CategoryService)
      .getAll({ status: 'active' })
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly brands = toSignal(
    inject(BrandService)
      .getAll({ status: 'active' })
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  /** Option groups of the "Load items" list. */
  protected readonly loadGroups = computed(() => [
    {
      label: 'By stock',
      choices: [
        {
          value: 'stock:negative',
          label: 'Items below zero (sold before being entered)',
          query: { stock: 'negative', status: 'all' },
        },
        { value: 'stock:in', label: 'Items in stock', query: { stock: 'in' } },
      ] as LoadChoice[],
    },
    {
      label: 'Category',
      choices: this.categories().map((category): LoadChoice => ({
        value: `category:${category.id}`,
        label: category.name,
        query: { categoryId: category.id },
      })),
    },
    {
      label: 'Brand',
      choices: this.brands().map((brand): LoadChoice => ({
        value: `brand:${brand.id}`,
        label: brand.name,
        query: { brandId: brand.id },
      })),
    },
  ]);

  protected readonly inStock = (item: SellableItem) => item.stock ?? null;

  /** Help line under the scan box. */
  protected readonly scanHint = computed(() => {
    if (this.store.mode() === 'count') {
      return 'Each scan counts one piece — or type the count in the row.';
    }
    return this.store.scanStep() < 0
      ? 'Each scan takes one more piece out — or type the quantity in the row.'
      : 'Each scan adds one piece — or type the quantity (+ / −) in the row.';
  });

  /** What the reason means for the stock (shown under the reason). */
  protected readonly reasonHint = computed(() => {
    const direction = ADJUSTMENT_DIRECTION[this.store.reason()];
    switch (this.store.reason()) {
      case 'opening_stock':
        return 'Goods already in the shop before they were entered here. Count them — items sold before being entered (below zero) are set right too.';
      case 'stock_count':
        return 'A physical count: what you count replaces the stock, more or less.';
      default:
        return direction === 'out'
          ? 'Goods leave stock — enter how many with a minus, e.g. −2.'
          : direction === 'in'
            ? 'Goods come into stock — enter how many, e.g. 2.'
            : 'Say in the notes what this is for.';
    }
  });

  constructor() {
    // The mode buttons and the store stay in step (the reason also picks the mode).
    effect(() => {
      const mode = this.store.mode();
      untracked(() => this.modeControl.setValue(mode, { emitEvent: false }));
    });
    this.modeControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((mode) => this.store.setMode(mode));

    effect(() => {
      const reason = this.reason();
      const preset = this.preset();
      untracked(() => void this.start(reason, preset));
    });

    // The number it will probably get depends on the date (financial year).
    effect(() => {
      const date = this.store.date();
      if (date) {
        untracked(() => void this.loadNextNumber(date));
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.store.hasUnsavedChanges();
  }

  // ---- Start -------------------------------------------------------------------------------------

  private async start(reason: string | undefined, preset: string | undefined): Promise<void> {
    const belowZero = preset === 'below-zero';
    const chosen = belowZero ? 'opening_stock' : reason;
    this.store.reset(
      this.today,
      ADJUSTMENT_REASONS.includes(chosen as AdjustmentReason)
        ? (chosen as AdjustmentReason)
        : 'stock_count',
    );
    if (belowZero) {
      const added = await this.loadItems({ stock: 'negative', status: 'all' });
      if (added === 0) {
        this.toast.info('No items are below zero.');
      }
      // Items loaded for counting are not "changes" yet.
      this.store.markSaved();
    }
    afterNextRender(() => this.itemSearch()?.focus(), { injector: this.injector });
  }

  private async loadNextNumber(date: string): Promise<void> {
    try {
      this.nextNumber.set(await firstValueFrom(this.adjustments.nextNumber(date)));
    } catch {
      this.nextNumber.set(null);
    }
  }

  // ---- Header ------------------------------------------------------------------------------------

  protected setReason(value: string): void {
    this.store.setReason(value as AdjustmentReason);
  }

  protected setDate(value: string): void {
    this.store.date.set(value);
  }

  protected setNotes(value: string): void {
    this.store.notes.set(value);
  }

  // ---- Items -------------------------------------------------------------------------------------

  protected addItem(item: SellableItem): void {
    if (!this.store.add(item as PurchasableItem)) {
      this.toast.warning('The adjustment is full — save it and start another one.');
    }
  }

  /** "Load items" list: adds every item of the choice that is not on the list yet. */
  protected async loadFrom(select: HTMLSelectElement): Promise<void> {
    const choice = this.loadGroups()
      .flatMap((group) => group.choices)
      .find((candidate) => candidate.value === select.value);
    select.value = '';
    if (!choice) return;
    const added = await this.loadItems(choice.query);
    if (added === 0) {
      this.toast.info(`Nothing to add from ${choice.label} — no items, or all are on the list.`);
    }
  }

  /** Adds the items found without a quantity; returns how many were added (-1 on failure). */
  private async loadItems(query: AdjustmentItemsQuery): Promise<number> {
    this.loadingItems.set(true);
    try {
      const items = await firstValueFrom(this.adjustments.items(query));
      const added = this.store.addMany(items);
      if (added > 0) {
        const what =
          this.store.mode() === 'count' ? 'enter what you count' : 'enter the quantities';
        this.toast.success(`${added} ${added === 1 ? 'item' : 'items'} added — ${what}.`);
        afterNextRender(() => this.focusFirstEmpty(), { injector: this.injector });
      }
      return added;
    } catch (error) {
      this.toast.error(toApiError(error).message);
      return -1;
    } finally {
      this.loadingItems.set(false);
    }
  }

  protected commitQuantity(line: AdjLineView, box: HTMLInputElement): void {
    const value = parseNumber(box.value);
    const problem =
      this.store.mode() === 'count'
        ? this.store.setCounted(line.key, value)
        : this.store.setChange(line.key, value);
    this.showFieldResult(`qty:${line.key}`, problem);
    if (problem) box.value = this.quantityText(line);
  }

  protected commitCost(line: AdjLineView, box: HTMLInputElement): void {
    const problem = this.store.setUnitCost(line.key, parseNumber(box.value));
    this.showFieldResult(`cost:${line.key}`, problem);
    if (problem) box.value = line.unitCost === null ? '' : line.unitCost.toFixed(2);
  }

  protected commitNote(line: AdjLineView, box: HTMLInputElement): void {
    this.store.setNote(line.key, box.value);
  }

  /** Enter in a quantity box: keep it and go to the next row's quantity (or the scan box). */
  protected commitAndNext(line: AdjLineView, box: HTMLInputElement): void {
    box.dispatchEvent(new Event('change'));
    const lines = this.store.lines();
    const index = lines.findIndex((candidate) => candidate.key === line.key);
    const next = lines[index + 1];
    if (next) {
      this.focusQuantity(next.key);
    } else {
      this.itemSearch()?.focus();
    }
  }

  /** Enter in another box of the row: keep it and go back to the scan box. */
  protected commitAndScan(box: HTMLInputElement): void {
    box.dispatchEvent(new Event('change'));
    this.itemSearch()?.focus();
  }

  protected removeLine(line: AdjLineView): void {
    this.store.remove(line.key);
    this.itemSearch()?.focus();
  }

  /** What a line's quantity box shows. */
  protected quantityText(line: AdjLineView): string {
    const value = this.store.mode() === 'count' ? line.counted : line.change;
    if (value === null) return '';
    return this.store.mode() === 'change' && value > 0 ? `+${value}` : String(value);
  }

  protected lineLabel(line: AdjLineView): string {
    const details = itemDetails(line.item);
    return details ? `${line.item.productName} (${details})` : line.item.productName;
  }

  protected fieldError(key: string): string | undefined {
    return this.fieldErrors()[key];
  }

  protected absolute(value: number): number {
    return Math.abs(value);
  }

  protected focusItems(): void {
    this.itemSearch()?.focus();
  }

  private focusQuantity(key: string): void {
    document
      .querySelector<HTMLInputElement>(`[data-line-key="${CSS.escape(key)}"] .qty-input`)
      ?.focus();
  }

  private focusFirstEmpty(): void {
    const line = this.store.lines().find((candidate) => candidate.difference === null);
    if (line) this.focusQuantity(line.key);
  }

  // ---- Save --------------------------------------------------------------------------------------

  protected async save(): Promise<void> {
    this.attempted.set(true);
    this.saveError.set(null);
    const problem = this.store.problem();
    if (problem || this.saving()) {
      if (problem) this.saveError.set(problem);
      return;
    }
    this.saving.set(true);
    try {
      const adjustment = await firstValueFrom(this.adjustments.create(this.store.toInput()));
      this.saved = true;
      this.store.markSaved();
      this.toast.success(`${adjustment.adjNo} saved — stock updated.`);
      await this.router.navigate(['/masters/stock-adjustment', adjustment.id]);
    } catch (error) {
      const apiError = toApiError(error);
      this.saveError.set(apiError.message);
      // A count refused because stock moved meanwhile: show the stock as it is now.
      if (apiError.field?.endsWith('.systemQuantity')) {
        await this.refreshStock();
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Reloads the stock of every line (the changed ones are marked "was …"). */
  protected async refreshStock(): Promise<void> {
    try {
      const levels = await firstValueFrom(
        this.stock.levels(this.store.lines().map((line) => line.item)),
      );
      const changed = this.store.updateStock(levels);
      if (changed) {
        this.toast.warning(
          `In stock changed for ${changed} ${changed === 1 ? 'item' : 'items'} (marked). ` +
            'Check the counts, then save again.',
        );
      }
    } catch (error) {
      this.toast.error(toApiError(error).message);
    }
  }

  protected onShortcut(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      this.itemSearch()?.focus();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.save();
    }
  }

  private showFieldResult(key: string, message: string | null | undefined): void {
    if (message) {
      this.fieldErrors.update((errors) => ({ ...errors, [key]: message }));
    } else if (this.fieldErrors()[key]) {
      this.fieldErrors.update(({ [key]: _removed, ...rest }) => rest);
    }
  }
}

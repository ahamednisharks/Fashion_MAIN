import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, firstValueFrom, map, of, switchMap } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { ITEM_SOURCE, ItemSource } from '../../../core/data-access/item-source';
import { SalesService } from '../../../core/data-access/sales.service';
import { SellableItem, itemDetails } from '../../../core/models/sale.model';
import { Icon } from '../../../shared/components/icon/icon';
import { errorBeep } from '../beep';

/** Typed text shorter than this does not open the suggestion list. */
const MIN_SEARCH_LENGTH = 2;
const SEARCH_LIMIT = 20;
const SEARCH_DELAY_MS = 250;

/** Why the list is open: suggestions while typing, or variants to choose after Enter. */
type ListMode = 'suggestions' | 'choose';

/**
 * The billing scan box. A barcode scanner types the code and presses Enter → exact lookup →
 * the item is emitted straight away. Typing shows a list of matching items (rows, not cards);
 * click a row or use ↑ / ↓ and Enter to pick one.
 */
@Component({
  selector: 'app-item-search',
  imports: [Icon, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './item-search.html',
  styleUrl: './item-search.scss',
})
export class ItemSearch {
  readonly picked = output<SellableItem>();
  /** Ends the 'inactive' message: "… is inactive and cannot be billed." */
  readonly purpose = input('billed');
  /** Rate column of the list (default: the selling price). */
  readonly rateLabel = input('Rate');
  readonly rateOf = input<(item: SellableItem) => number | null>((item) => item.unitPrice);
  /** Help line under the box (when there is no error). */
  readonly hint = input('Scanning the same item again increases its quantity.');

  /** Billing searches the sales catalogue; other pages may provide ITEM_SOURCE. */
  private readonly sales: ItemSource =
    inject(ITEM_SOURCE, { optional: true }) ?? inject(SalesService);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly listbox = viewChild<ElementRef<HTMLElement>>('listbox');

  protected readonly text = signal('');
  protected readonly results = signal<readonly SellableItem[]>([]);
  protected readonly listMode = signal<ListMode>('suggestions');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly activeId = computed(() =>
    this.open() && this.active() >= 0 ? `item-option-${this.active()}` : null,
  );
  protected readonly itemDetails = itemDetails;
  protected readonly limitReached = computed(
    () => this.listMode() === 'suggestions' && this.results().length >= SEARCH_LIMIT,
  );

  private readonly typed = new Subject<{ text: string; generation: number }>();
  /** Bumped on Enter / pick so late suggestion responses are ignored. */
  private generation = 0;
  /** Scans are resolved one after another, in the order they were made. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.typed
      .pipe(
        debounceTime(SEARCH_DELAY_MS),
        switchMap(({ text, generation }) =>
          text.length < MIN_SEARCH_LENGTH
            ? of(null)
            : this.sales.search(text, SEARCH_LIMIT).pipe(
                map((items) => ({ items, generation })),
                catchError((error: unknown) => {
                  this.error.set(toApiError(error).message);
                  return of(null);
                }),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (!result || result.generation !== this.generation) {
          return;
        }
        this.showList(result.items, 'suggestions', -1);
      });
  }

  /** Puts the cursor in the scan box (F2, after adding an item, after saving a bill…). */
  focus(): void {
    this.input().nativeElement.focus();
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.error.set(null);
    const text = value.trim();
    if (text.length < MIN_SEARCH_LENGTH) {
      this.closeList();
    }
    this.typed.next({ text, generation: this.generation });
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.submit();
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.closeList();
        } else if (this.text()) {
          event.preventDefault();
          this.reset();
        }
        break;
      case 'Tab':
        this.closeList();
        break;
    }
  }

  /** Enter / Add: the highlighted row if the user chose one, otherwise look the code up. */
  protected submit(): void {
    const highlighted = this.open() ? this.results()[this.active()] : undefined;
    if (highlighted) {
      this.choose(highlighted);
      return;
    }
    const code = this.text().trim();
    if (!code) {
      return;
    }
    // Clear the box at once so the next scan can start while this one is looked up.
    this.generation++;
    this.setText('');
    this.closeList();
    this.queue = this.queue.then(() => this.resolve(code));
  }

  protected choose(item: SellableItem): void {
    if (item.status !== 'active') {
      this.fail(`${item.productName} is inactive and cannot be ${this.purpose()}.`);
      return;
    }
    this.generation++;
    this.error.set(null);
    this.closeList();
    this.setText('');
    this.picked.emit(item);
    this.focus();
  }

  protected onBlur(): void {
    // Rows keep focus in the input (mousedown is prevented), so a blur means the user left.
    this.closeList();
  }

  protected trackItem(item: SellableItem): string {
    return `${item.productId}|${item.variantId ?? ''}`;
  }

  /** Exact barcode / SKU / product code first; then a text search as a fallback. */
  private async resolve(code: string): Promise<void> {
    this.busy.set(true);
    try {
      const exact = await firstValueFrom(this.sales.lookup(code));
      const sellable = exact.filter((item) => item.status === 'active');
      if (exact.length && !sellable.length) {
        this.fail(`${exact[0].productName} is inactive and cannot be ${this.purpose()}.`, code);
        return;
      }
      if (sellable.length === 1) {
        this.emitScanned(sellable[0]);
        return;
      }
      if (sellable.length > 1) {
        this.offer(code, sellable);
        return;
      }

      const found = await firstValueFrom(this.sales.search(code, SEARCH_LIMIT));
      if (found.length === 1) {
        this.emitScanned(found[0]);
      } else if (found.length > 1) {
        this.offer(code, found);
      } else {
        this.fail(`No item found for “${code}”. Check the barcode or type the item name.`, code);
      }
    } catch (error) {
      this.fail(toApiError(error).message, code);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * A scanned code resolved to one item. The box was cleared when Enter was pressed and may
   * already hold the next code, so it is left untouched.
   */
  private emitScanned(item: SellableItem): void {
    this.error.set(null);
    this.picked.emit(item);
  }

  /** Several matches (e.g. a product code with sizes / colours): let the user pick one. */
  private offer(code: string, items: readonly SellableItem[]): void {
    if (!this.text()) {
      this.setText(code);
    }
    this.showList(items, 'choose', 0);
  }

  private showList(items: readonly SellableItem[], mode: ListMode, active: number): void {
    this.results.set(items);
    this.listMode.set(mode);
    this.active.set(active);
    this.open.set(items.length > 0 || mode === 'suggestions');
  }

  private move(delta: 1 | -1): void {
    const count = this.results().length;
    if (!count) {
      return;
    }
    if (!this.open()) {
      this.open.set(true);
    }
    const next = this.active() < 0 ? (delta > 0 ? 0 : count - 1) : this.active() + delta;
    this.active.set((next + count) % count);
    // Keep the highlighted row visible inside the scrolling list.
    queueMicrotask(() =>
      this.listbox()
        ?.nativeElement.querySelector(`#item-option-${this.active()}`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }

  private fail(message: string, code?: string): void {
    this.error.set(message);
    errorBeep();
    // Show the failed code (selected) so the next scan simply replaces it.
    if (code && !this.text()) {
      this.setText(code);
      queueMicrotask(() => this.input().nativeElement.select());
    }
    this.focus();
  }

  private closeList(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  private reset(): void {
    this.generation++;
    this.setText('');
    this.error.set(null);
    this.closeList();
  }

  private setText(value: string): void {
    this.text.set(value);
    this.input().nativeElement.value = value;
  }
}

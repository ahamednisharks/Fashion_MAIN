import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icon } from '../icon/icon';

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50];

type PageItem = number | 'gap-start' | 'gap-end';

@Component({
  selector: 'app-pagination',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagination.scss',
  host: { '[class.is-empty]': 'total() === 0' },
  template: `
    @if (total() > 0) {
      <p class="pagination-info">
        <span class="hide-xs">Showing </span><strong>{{ from() }}–{{ to() }}</strong> of
        <strong>{{ total() }}</strong>
      </p>
      <nav class="pagination-controls" aria-label="Pagination">
        <label class="page-size">
          <span class="hide-xs">Rows</span>
          <select
            #sizeSelect
            class="form-control"
            aria-label="Rows per page"
            (change)="pageSizeChange.emit(+sizeSelect.value)"
          >
            @for (size of sizeOptions; track size) {
              <option [value]="size" [selected]="size === pageSize()">{{ size }}</option>
            }
          </select>
        </label>
        <button
          type="button"
          class="btn btn-secondary btn-icon btn-sm"
          aria-label="Previous page"
          [disabled]="page() <= 1"
          (click)="go(page() - 1)"
        >
          <app-icon name="chevron-left" />
        </button>
        <span class="page-status show-mobile">{{ page() }} / {{ pageCount() }}</span>
        <span class="page-list hide-mobile">
          @for (item of pages(); track item) {
            @if (item === 'gap-start' || item === 'gap-end') {
              <span class="page-gap" aria-hidden="true">…</span>
            } @else {
              <button
                type="button"
                class="btn btn-sm page-btn"
                [class.is-current]="item === page()"
                [attr.aria-current]="item === page() ? 'page' : null"
                [attr.aria-label]="'Page ' + item"
                (click)="go(item)"
              >
                {{ item }}
              </button>
            }
          }
        </span>
        <button
          type="button"
          class="btn btn-secondary btn-icon btn-sm"
          aria-label="Next page"
          [disabled]="page() >= pageCount()"
          (click)="go(page() + 1)"
        >
          <app-icon name="chevron-right" />
        </button>
      </nav>
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly sizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  protected readonly from = computed(() =>
    Math.min(this.total(), (this.page() - 1) * this.pageSize() + 1),
  );
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));

  /** Compact page list: 1 … 4 5 6 … 12 */
  protected readonly pages = computed<PageItem[]>(() => {
    const count = this.pageCount();
    const current = this.page();
    if (count <= 7) {
      return Array.from({ length: count }, (_, i) => i + 1);
    }
    const start = Math.max(2, Math.min(current - 1, count - 4));
    const end = Math.min(count - 1, Math.max(current + 1, 5));
    const items: PageItem[] = [1];
    if (start > 2) items.push('gap-start');
    for (let p = start; p <= end; p++) items.push(p);
    if (end < count - 1) items.push('gap-end');
    items.push(count);
    return items;
  });

  protected go(page: number): void {
    const target = Math.min(Math.max(1, page), this.pageCount());
    if (target !== this.page()) {
      this.pageChange.emit(target);
    }
  }
}

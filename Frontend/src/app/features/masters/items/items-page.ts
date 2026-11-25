import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { ListQuery, SortState } from '../../../core/data-access/api.types';
import { AuthService } from '../../../core/auth/auth.service';
import { BrandService } from '../../../core/data-access/brand.service';
import { CategoryService } from '../../../core/data-access/category.service';
import { ColorService } from '../../../core/data-access/color.service';
import { ItemService } from '../../../core/data-access/item.service';
import { SizeService } from '../../../core/data-access/size.service';
import { BarcodeFilter, CatalogItem, itemKey } from '../../../core/models/item.model';
import { itemDetails } from '../../../core/models/sale.model';
import { StockFilter } from '../../../core/models/stock.model';
import { Icon } from '../../../shared/components/icon/icon';
import { IconName } from '../../../shared/components/icon/icon-registry';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { injectListController } from '../../../shared/list/list-controller';
import { LabelQueue } from '../../barcodes/label-queue';
import { StockHistoryDialog } from './stock-history-dialog';

interface SortColumn {
  readonly key: string;
  readonly label: string;
  readonly end?: boolean;
}

const SORT_COLUMNS: Readonly<Record<string, SortColumn>> = {
  name: { key: 'name', label: 'Item' },
  sku: { key: 'sku', label: 'SKU' },
  barcode: { key: 'barcode', label: 'Barcode' },
  mrp: { key: 'mrp', label: 'MRP (₹)', end: true },
  unitPrice: { key: 'unitPrice', label: 'Price (₹)', end: true },
  stock: { key: 'stock', label: 'Stock', end: true },
};

/**
 * Items: one row per product variant, or per product without variants — exactly what billing
 * scans and labels show, with the quantity in hand (click it for the item's stock history).
 * Find items (search, category, brand, size, colour, barcode missing, stock), tick them and send
 * them to Barcode Assign; editing stays in the product form.
 */
@Component({
  selector: 'app-items-page',
  imports: [
    DecimalPipe,
    RouterLink,
    Icon,
    PageHeader,
    ListToolbar,
    Pagination,
    EmptyState,
    ErrorState,
    StockHistoryDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './items-page.html',
  styleUrl: './items-page.scss',
})
export class ItemsPage {
  private readonly items = inject(ItemService);
  private readonly router = inject(Router);
  private readonly queue = inject(LabelQueue);
  private readonly auth = inject(AuthService);

  protected readonly list = injectListController(
    (query: ListQuery) =>
      this.items.list({
        search: query.search,
        status: query.status,
        categoryId: query.filters['categoryId'],
        brandId: query.filters['brandId'],
        sizeId: query.filters['sizeId'],
        colorId: query.filters['colorId'],
        barcode: (query.filters['barcode'] ?? '') as BarcodeFilter | '',
        stock: (query.filters['stock'] ?? '') as StockFilter | '',
        page: query.page,
        pageSize: query.pageSize,
        sort: query.sort,
      }),
    {
      filterKeys: ['categoryId', 'brandId', 'sizeId', 'colorId', 'barcode', 'stock'],
      defaultPageSize: 25,
    },
  );

  /** Stock Adjustment (opening stock) is for administrators. */
  protected readonly isAdmin = computed(() => this.auth.enabled && this.auth.isAdmin());

  protected readonly counts = toSignal(this.items.counts().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  // Filter options include inactive records so older items can still be found.
  protected readonly categories = toSignal(
    inject(CategoryService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly brands = toSignal(
    inject(BrandService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly sizes = toSignal(
    inject(SizeService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly colors = toSignal(
    inject(ColorService)
      .getAll()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  /** Ticked items, kept while paging and filtering. */
  private readonly selection = signal<ReadonlyMap<string, CatalogItem>>(new Map());
  protected readonly selectedCount = computed(() => this.selection().size);
  protected readonly pageAllSelected = computed(() => {
    const rows = this.list.items();
    return rows.length > 0 && rows.every((row) => this.selection().has(itemKey(row)));
  });
  protected readonly pageSomeSelected = computed(
    () =>
      !this.pageAllSelected() &&
      this.list.items().some((row) => this.selection().has(itemKey(row))),
  );

  /** The item whose stock history is open. */
  protected readonly historyItem = signal<CatalogItem | null>(null);
  protected readonly sortColumns = SORT_COLUMNS;
  protected readonly itemDetails = itemDetails;
  protected readonly itemKey = itemKey;

  protected isSelected(item: CatalogItem): boolean {
    return this.selection().has(itemKey(item));
  }

  protected toggle(item: CatalogItem, selected: boolean): void {
    this.selection.update((current) => {
      const next = new Map(current);
      if (selected) next.set(itemKey(item), item);
      else next.delete(itemKey(item));
      return next;
    });
  }

  protected togglePage(selected: boolean): void {
    this.selection.update((current) => {
      const next = new Map(current);
      for (const item of this.list.items()) {
        if (selected) next.set(itemKey(item), item);
        else next.delete(itemKey(item));
      }
      return next;
    });
  }

  protected clearSelection(): void {
    this.selection.set(new Map());
  }

  /** Opens Barcode Assign with the ticked items (or one item from its row). */
  protected openBarcodes(items: readonly CatalogItem[] = [...this.selection().values()]): void {
    this.queue.put(items);
    void this.router.navigate(['/masters/barcodes']);
  }

  protected showMissing(): void {
    this.list.setFilter('barcode', 'missing');
  }

  protected showBelowZero(): void {
    this.list.setFilter('stock', 'negative');
  }

  // ---- Sorting ---------------------------------------------------------------------------------

  protected sortIcon(key: string): IconName {
    const sort = this.list.query().sort;
    if (sort?.field !== key) return 'chevron-expand';
    return sort.direction === 'asc' ? 'caret-up-fill' : 'caret-down-fill';
  }

  protected ariaSort(key: string): 'ascending' | 'descending' | null {
    const sort = this.list.query().sort;
    if (sort?.field !== key) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected toggleSort(key: string): void {
    const sort = this.list.query().sort;
    let next: SortState | null = { field: key, direction: 'asc' };
    if (sort?.field === key) {
      next = sort.direction === 'asc' ? { field: key, direction: 'desc' } : null;
    }
    this.list.setSort(next);
  }
}

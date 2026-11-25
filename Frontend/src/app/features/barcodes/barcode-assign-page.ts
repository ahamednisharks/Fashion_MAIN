import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, firstValueFrom, map, of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { toApiError } from '../../core/data-access/api.types';
import { BrandService } from '../../core/data-access/brand.service';
import { CategoryService } from '../../core/data-access/category.service';
import { ItemService } from '../../core/data-access/item.service';
import { ProductService } from '../../core/data-access/product.service';
import { ShopSettingsService } from '../../core/data-access/shop-settings.service';
import { BarcodeSettings, LabelLayoutId, LabelOptions } from '../../core/models/item.model';
import { SellableItem } from '../../core/models/sale.model';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { HasUnsavedChanges } from '../../shared/guards/unsaved-changes.guard';
import { ItemSearch } from '../billing/item-search/item-search';
import {
  BARCODE_PATTERN,
  BarcodeRowView,
  BarcodeStore,
  MAX_COPIES,
  MAX_ROWS,
} from './barcode-store';
import { LABEL_LAYOUTS, LABEL_LAYOUT_LIST, LabelData } from './label-layouts';
import { LabelQueue } from './label-queue';
import { LabelSheet } from './label-sheet';
import { PriceLabel } from './price-label';

const DEFAULT_OPTIONS: LabelOptions = {
  labelLayout: 'roll-50x25',
  showShopName: true,
  showProductName: true,
  showDetails: true,
  showMrp: true,
  showSellingPrice: false,
};

const SAMPLE_LABEL: LabelData = {
  barcode: '2000000000015',
  productName: 'Printed Cotton Kurti',
  details: 'K-21 · M · Mustard',
  mrp: 999,
  price: 849,
};

/** Items without a barcode are added this many at a time (the list endpoint's page limit). */
const BULK_ADD_LIMIT = 100;

type OptionFlag = Exclude<keyof LabelOptions, 'labelLayout'>;

/**
 * Barcode Assign: build a list of items (scan / search, all items without a barcode in a
 * category or brand, or ticked on the Items screen), give them barcodes — the shop's next
 * number or a maker's barcode scanned into the row — and print price labels.
 */
@Component({
  selector: 'app-barcode-assign-page',
  imports: [DecimalPipe, RouterLink, Icon, PageHeader, ItemSearch, PriceLabel, LabelSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barcode-assign-page.html',
  styleUrl: './barcode-assign-page.scss',
  providers: [BarcodeStore],
})
export class BarcodeAssignPage implements HasUnsavedChanges {
  protected readonly store = inject(BarcodeStore);
  private readonly items = inject(ItemService);
  private readonly products = inject(ProductService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly isAdmin = inject(AuthService).isAdmin;

  private readonly search = viewChild.required(ItemSearch);
  private readonly sheet = viewChild.required(LabelSheet);

  protected readonly maxCopies = MAX_COPIES;
  protected readonly maxRows = MAX_ROWS;
  protected readonly layouts = LABEL_LAYOUT_LIST;

  // ---- Masters for the "add items without a barcode" filters -----------------------------------
  protected readonly categories = toSignal(
    inject(CategoryService)
      .getAll({ status: 'active' })
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly brands = toSignal(
    inject(BrandService)
      .getAll({ status: 'active' })
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly bulkCategory = signal('');
  protected readonly bulkBrand = signal('');
  protected readonly bulkBusy = signal(false);

  // ---- Saving ----------------------------------------------------------------------------------
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  // ---- Label settings --------------------------------------------------------------------------
  protected readonly settings = signal<BarcodeSettings | null>(null);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly options = signal<LabelOptions>(DEFAULT_OPTIONS);
  protected readonly prefix = signal('200');
  protected readonly savingSettings = signal(false);
  protected readonly startAt = signal(1);
  protected readonly spec = computed(() => LABEL_LAYOUTS[this.options().labelLayout]);
  protected readonly shopName = toSignal(
    inject(ShopSettingsService)
      .getProfile()
      .pipe(
        map((profile) => profile.shopName),
        catchError(() => of('')),
      ),
    { initialValue: '' },
  );
  protected readonly optionsChanged = computed(() => {
    const saved = this.settings();
    if (!saved) return false;
    const options = this.options();
    return (
      this.prefix() !== saved.prefix ||
      (Object.keys(DEFAULT_OPTIONS) as (keyof LabelOptions)[]).some(
        (key) => options[key] !== saved[key],
      )
    );
  });
  protected readonly prefixValid = computed(() => /^2[0-9]{2}$/.test(this.prefix()));

  /** The first printable row (or a sample) shown in the label preview. */
  protected readonly previewLabel = computed<LabelData>(() => {
    const row = this.store.rows().find((candidate) => candidate.printable);
    return row
      ? {
          barcode: row.current,
          productName: row.item.productName,
          details: row.details,
          mrp: row.item.mrp,
          price: row.item.unitPrice,
        }
      : { ...SAMPLE_LABEL, barcode: this.settings()?.nextBarcode || SAMPLE_LABEL.barcode };
  });
  protected readonly previewIsSample = computed(
    () => !this.store.rows().some((row) => row.printable),
  );

  /** Snapshot of the labels being printed. */
  protected readonly printLabels = signal<readonly LabelData[]>([]);

  constructor() {
    const handed = inject(LabelQueue).take();
    if (handed.length) {
      this.store.addMissing(
        handed.map((request) => request.item),
        handed.map((request) => request.copies),
      );
    }
    this.loadSettings();
  }

  hasUnsavedChanges(): boolean {
    return this.store.hasUnsaved();
  }

  // ---- Building the list -----------------------------------------------------------------------

  protected onPicked(item: SellableItem): void {
    if (this.store.count() >= MAX_ROWS && !this.store.rows().some((row) => row.item === item)) {
      this.toast.warning(`The list can hold ${MAX_ROWS} items. Save and print, then clear it.`);
      return;
    }
    const key = this.store.add(item);
    const row = this.store.rows().find((candidate) => candidate.key === key);
    // An item without a barcode: put the cursor in its barcode box, ready for a maker's barcode.
    if (row?.toSave) {
      this.focusRow(row.index, false);
    }
  }

  protected async addWithoutBarcode(): Promise<void> {
    this.bulkBusy.set(true);
    try {
      const page = await firstValueFrom(
        this.items.list({
          barcode: 'missing',
          status: 'active',
          categoryId: this.bulkCategory(),
          brandId: this.bulkBrand(),
          pageSize: BULK_ADD_LIMIT,
        }),
      );
      const added = this.store.addMissing(page.items);
      if (!page.total) {
        this.toast.info('Every active item in this selection already has a barcode.');
      } else if (page.total > page.items.length) {
        this.toast.info(
          `Added ${added} of ${page.total} items without a barcode. Save, then add again for the rest.`,
        );
      } else {
        this.toast.success(
          added
            ? `Added ${added} item${added === 1 ? '' : 's'} without a barcode.`
            : 'Those items are already on the list.',
        );
      }
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.bulkBusy.set(false);
    }
  }

  protected remove(row: BarcodeRowView): void {
    this.store.remove(row.key);
  }

  protected clearList(): void {
    this.store.clear();
    this.saveError.set(null);
    this.search().focus();
  }

  // ---- Row editing -----------------------------------------------------------------------------

  protected onEntered(row: BarcodeRowView, value: string): void {
    this.store.setEntered(row.key, value);
  }

  /** Enter in a barcode box (a scanner sends it): check the code, then go to the next row. */
  protected onBarcodeEnter(event: Event, row: BarcodeRowView): void {
    event.preventDefault();
    void this.checkTaken(row);
    const next = this.store
      .rows()
      .find((candidate) => candidate.index > row.index && candidate.toSave);
    if (next) {
      this.focusRow(next.index, false);
    } else {
      this.search().focus();
    }
  }

  /** Asks the server whether a typed barcode is already used (the save checks it again). */
  protected async checkTaken(row: BarcodeRowView): Promise<void> {
    const code = row.entered.trim();
    if (!code || !BARCODE_PATTERN.test(code) || row.error) {
      return;
    }
    try {
      const taken = await firstValueFrom(this.products.isTaken('barcode', code));
      const current = this.store.rows().find((candidate) => candidate.key === row.key);
      // Only if the box still holds the code that was checked.
      if (taken && current?.entered.trim() === code) {
        this.store.setRowError(row.key, `Barcode ${code} is already used by another item.`);
      }
    } catch {
      // Not decisive: the save checks again.
    }
  }

  protected setCopies(row: BarcodeRowView, value: string): void {
    this.store.setCopies(row.key, value === '' ? 0 : Number(value));
  }

  protected setAllCopies(value: string): void {
    const copies = Number(value);
    if (value !== '' && Number.isFinite(copies)) {
      this.store.setAllCopies(copies);
    }
  }

  protected startReplacing(row: BarcodeRowView): void {
    this.store.setReplacing(row.key, true);
    this.focusRow(row.index, false);
  }

  protected keepBarcode(row: BarcodeRowView): void {
    this.store.setReplacing(row.key, false);
  }

  // ---- Save ------------------------------------------------------------------------------------

  protected async save(): Promise<void> {
    this.saveError.set(null);
    const firstError = this.store.rows().find((row) => row.error);
    if (firstError) {
      this.toast.error(`Fix row ${firstError.index + 1} first: ${firstError.error}`);
      this.focusRow(firstError.index, true);
      return;
    }
    const request = this.store.assignmentInput();
    if (!request.length || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.items.assignBarcodes(request));
      this.store.applySaved(saved);
      const generated = saved.filter((result) => result.generated).length;
      const changed = saved.filter((result) => result.barcode !== result.previousBarcode).length;
      this.toast.success(
        `Saved ${changed} barcode${changed === 1 ? '' : 's'}` +
          (generated ? ` (${generated} new shop number${generated === 1 ? '' : 's'}).` : '.') +
          ' Labels can be printed now.',
      );
      this.loadSettings(false);
    } catch (error) {
      const apiError = toApiError(error);
      const key = this.store.applyError(apiError.field, apiError.message);
      if (key) {
        const row = this.store.rows().find((candidate) => candidate.key === key);
        this.toast.error(`Row ${(row?.index ?? 0) + 1}: ${apiError.message}`);
        if (row) this.focusRow(row.index, true);
      } else {
        this.saveError.set(apiError.message);
      }
    } finally {
      this.saving.set(false);
    }
  }

  // ---- Print -----------------------------------------------------------------------------------

  protected print(): void {
    const labels = this.store.labels();
    if (!labels.length) {
      this.toast.info('Nothing to print: save barcodes first, and set at least one label.');
      return;
    }
    this.printLabels.set(labels);
    afterNextRender(() => this.sheet().print(() => this.search().focus()), {
      injector: this.injector,
    });
  }

  /** Prints the preview label once — to check alignment on the label stock. */
  protected printTest(): void {
    this.printLabels.set([this.previewLabel()]);
    afterNextRender(() => this.sheet().print(), { injector: this.injector });
  }

  // ---- Label settings --------------------------------------------------------------------------

  protected setLayout(layout: LabelLayoutId): void {
    this.options.update((options) => ({ ...options, labelLayout: layout }));
  }

  protected setOption(flag: OptionFlag, value: boolean): void {
    this.options.update((options) => ({ ...options, [flag]: value }));
  }

  protected setStartAt(value: string): void {
    const position = Math.trunc(Number(value));
    const max = this.spec().perPage;
    this.startAt.set(Number.isFinite(position) ? Math.min(Math.max(position, 1), max) : 1);
  }

  protected async saveSettings(): Promise<void> {
    if (!this.prefixValid() || this.savingSettings()) {
      return;
    }
    this.savingSettings.set(true);
    try {
      const saved = await firstValueFrom(
        this.items.saveSettings({ ...this.options(), prefix: this.prefix() }),
      );
      this.applySettings(saved);
      this.toast.success('Label settings saved for everyone.');
    } catch (error) {
      this.toast.error(toApiError(error).message);
    } finally {
      this.savingSettings.set(false);
    }
  }

  protected resetSettings(): void {
    const saved = this.settings();
    if (saved) this.applySettings(saved);
  }

  /** Loads the saved settings; `applyOptions` false only refreshes the numbering. */
  private loadSettings(applyOptions = true): void {
    this.items.settings().subscribe({
      next: (settings) => {
        this.settingsError.set(null);
        if (applyOptions || !this.settings()) {
          this.applySettings(settings);
        } else {
          this.settings.update((current) =>
            current
              ? { ...current, lastNumber: settings.lastNumber, nextBarcode: settings.nextBarcode }
              : settings,
          );
        }
      },
      error: (error: unknown) => this.settingsError.set(toApiError(error).message),
    });
  }

  private applySettings(settings: BarcodeSettings): void {
    this.settings.set(settings);
    this.prefix.set(settings.prefix);
    this.options.set({
      labelLayout: settings.labelLayout,
      showShopName: settings.showShopName,
      showProductName: settings.showProductName,
      showDetails: settings.showDetails,
      showMrp: settings.showMrp,
      showSellingPrice: settings.showSellingPrice,
    });
  }

  // ---- Helpers ---------------------------------------------------------------------------------

  /** Puts the cursor in a row's barcode box (or the labels box when it has a barcode). */
  private focusRow(index: number, select: boolean): void {
    afterNextRender(
      () => {
        const input = this.host.querySelector<HTMLInputElement>(
          `[data-row="${index}"] .barcode-input, [data-row="${index}"] .copies-input`,
        );
        input?.focus();
        if (select) input?.select();
        input?.closest('tr')?.scrollIntoView({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }
}

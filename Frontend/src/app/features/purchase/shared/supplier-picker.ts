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

import { toApiError } from '../../../core/data-access/api.types';
import { SupplierService } from '../../../core/data-access/supplier.service';
import { Supplier } from '../../../core/models/supplier.model';
import { Icon } from '../../../shared/components/icon/icon';
import { SUPPLIER_PICKER_HOST, supplierAddress } from './purchase-supplier';

const MAX_RESULTS = 30;

/**
 * Supplier of a purchase order / entry. Type a name, mobile, GSTIN or city and pick a row; once chosen, the
 * supplier's details and the tax type (CGST + SGST or IGST) are shown with a Change button.
 */
@Component({
  selector: 'app-supplier-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-picker.html',
  styleUrl: './supplier-picker.scss',
})
export class SupplierPicker {
  /** Shows the field as invalid (after a save attempt without a supplier). */
  readonly invalid = input(false);
  /** A supplier was chosen (the page moves the cursor on). */
  readonly chosen = output<void>();

  /** The page provides its document store as SUPPLIER_PICKER_HOST. */
  protected readonly store = inject(SUPPLIER_PICKER_HOST);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('search');

  private readonly suppliers = signal<readonly Supplier[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);

  protected readonly results = computed(() => {
    const words = this.text().toLowerCase().split(/\s+/).filter(Boolean);
    return this.suppliers()
      .filter((supplier) => {
        const haystack = [supplier.name, supplier.mobile, supplier.gstNumber, supplier.city]
          .join(' ')
          .toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, MAX_RESULTS);
  });

  protected readonly taxLabel = computed(() =>
    this.store.supplyType() === 'inter'
      ? 'Other state — IGST'
      : this.store.shopState()
        ? 'Same state — CGST + SGST'
        : 'CGST + SGST',
  );

  constructor() {
    inject(SupplierService)
      .getAll({ status: 'active' })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (suppliers) => {
          this.suppliers.set(suppliers);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error).message);
          this.loading.set(false);
        },
      });
  }

  focus(): void {
    this.input()?.nativeElement.focus();
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.active.set(0);
    this.open.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        if (count) {
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          this.active.set((this.active() + delta + count) % count);
        }
        break;
      case 'Enter': {
        const supplier = this.open() ? this.results()[this.active()] : undefined;
        if (supplier) {
          event.preventDefault();
          this.choose(supplier);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.open.set(false);
        }
        break;
    }
  }

  protected choose(supplier: Supplier): void {
    this.store.supplier.set({
      id: supplier.id,
      name: supplier.name,
      mobile: supplier.mobile,
      gstNumber: supplier.gstNumber,
      state: supplier.state,
      status: supplier.status,
      address: supplierAddress(supplier),
    });
    this.text.set('');
    this.open.set(false);
    this.chosen.emit();
  }

  protected change(): void {
    this.store.supplier.set(null);
    queueMicrotask(() => this.focus());
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { CustomerService } from '../../../core/data-access/customer.service';
import { Customer } from '../../../core/models/customer.model';
import { Icon } from '../../../shared/components/icon/icon';
import { BillStore } from '../bill-store';

type LookupState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-found'; mobile: string }
  | { kind: 'inactive'; customer: Customer }
  | { kind: 'error'; message: string };

const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** "+91 98765-43210" → "9876543210" (same rule as the API). */
function mobileDigits(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/**
 * Customer for the bill, found by mobile number. Left empty, the bill is for a walk-in
 * customer. An unknown number can be saved as a new customer with just a name.
 */
@Component({
  selector: 'app-customer-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-picker.html',
  styleUrl: './customer-picker.scss',
})
export class CustomerPicker {
  /** Enter in the mobile box with nothing to look up — the page moves on to payment. */
  readonly done = output<void>();

  protected readonly store = inject(BillStore);
  private readonly customers = inject(CustomerService);
  private readonly mobileInput = viewChild<ElementRef<HTMLInputElement>>('mobile');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly state = signal<LookupState>({ kind: 'idle' });
  protected readonly inactiveName = computed(() => {
    const state = this.state();
    return state.kind === 'inactive' ? state.customer.name : '';
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });
  protected readonly mobileText = signal('');
  protected readonly newName = signal('');
  protected readonly adding = signal(false);
  /** Ignore answers to lookups that were superseded by further typing. */
  private lookupId = 0;

  focus(): void {
    if (this.store.customer()) {
      return;
    }
    this.mobileInput()?.nativeElement.focus();
    this.mobileInput()?.nativeElement.select();
  }

  /** Back to walk-in with an empty box (new bill). */
  reset(): void {
    this.lookupId++;
    this.mobileText.set('');
    this.newName.set('');
    this.state.set({ kind: 'idle' });
  }

  protected onMobileInput(value: string): void {
    this.mobileText.set(value);
    const digits = mobileDigits(value);
    if (MOBILE_PATTERN.test(digits)) {
      void this.lookup(digits);
    } else {
      this.lookupId++;
      this.state.set({ kind: 'idle' });
    }
  }

  protected onMobileEnter(): void {
    const digits = mobileDigits(this.mobileText());
    if (!digits) {
      this.done.emit();
      return;
    }
    const state = this.state();
    if (state.kind === 'not-found') {
      this.nameInput()?.nativeElement.focus();
    } else if (!MOBILE_PATTERN.test(digits)) {
      this.state.set({
        kind: 'error',
        message: 'Enter a valid 10-digit mobile number starting with 6–9.',
      });
    }
  }

  protected async addCustomer(): Promise<void> {
    const state = this.state();
    const name = this.newName().replace(/\s+/g, ' ').trim();
    if (state.kind !== 'not-found' || !name || this.adding()) {
      this.nameInput()?.nativeElement.focus();
      return;
    }
    this.adding.set(true);
    try {
      const customer = await firstValueFrom(
        this.customers.create({
          name,
          mobile: state.mobile,
          email: '',
          address: '',
          city: '',
          state: '',
          pincode: '',
          gstNumber: '',
          openingBalance: 0,
          status: 'active',
        }),
      );
      this.select(customer);
    } catch (error) {
      this.state.set({ kind: 'error', message: toApiError(error).message });
    } finally {
      this.adding.set(false);
    }
  }

  protected clearCustomer(): void {
    this.store.customer.set(null);
    this.reset();
    queueMicrotask(() => this.focus());
  }

  private async lookup(mobile: string): Promise<void> {
    const id = ++this.lookupId;
    this.state.set({ kind: 'checking' });
    try {
      const page = await firstValueFrom(
        this.customers.list({
          search: mobile,
          status: '',
          filters: {},
          page: 1,
          pageSize: 5,
          sort: null,
        }),
      );
      if (id !== this.lookupId) {
        return;
      }
      const match = page.items.find((customer) => customer.mobile === mobile);
      if (!match) {
        this.newName.set('');
        this.state.set({ kind: 'not-found', mobile });
      } else if (match.status !== 'active') {
        this.state.set({ kind: 'inactive', customer: match });
      } else {
        this.select(match);
      }
    } catch (error) {
      if (id === this.lookupId) {
        this.state.set({ kind: 'error', message: toApiError(error).message });
      }
    }
  }

  private select(customer: Customer): void {
    this.store.customer.set(customer);
    this.state.set({ kind: 'idle' });
    this.mobileText.set('');
    this.newName.set('');
  }
}

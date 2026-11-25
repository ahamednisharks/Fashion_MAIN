import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { CustomerService } from '../../../core/data-access/customer.service';
import { EntityStatus, STATUS_OPTIONS } from '../../../core/models/base.model';
import { Customer, CustomerInput } from '../../../core/models/customer.model';
import { AddressFields } from '../../../shared/components/address-fields/address-fields';
import { FormFooter } from '../../../shared/components/form-footer/form-footer';
import { FormField } from '../../../shared/components/form-field/form-field';
import { Icon } from '../../../shared/components/icon/icon';
import { SegmentedControl } from '../../../shared/components/segmented-control/segmented-control';
import { AppValidators } from '../../../shared/forms/app-validators';
import { injectModalForm } from '../../../shared/forms/form-submitter';
import { linkGstinWithState } from '../../../shared/forms/gstin-state-link';
import { MobileInput } from '../../../shared/forms/mobile-input.directive';
import { UppercaseInput } from '../../../shared/forms/uppercase-input.directive';

@Component({
  selector: 'app-customer-form',
  imports: [
    ReactiveFormsModule,
    FormField,
    FormFooter,
    SegmentedControl,
    AddressFields,
    Icon,
    MobileInput,
    UppercaseInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './customer-form.html',
})
export class CustomerForm implements OnInit {
  readonly customer = input<Customer | null>(null);
  readonly saved = output<Customer>();

  private readonly service = inject(CustomerService);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [AppValidators.required, Validators.maxLength(100)]],
    mobile: [
      '',
      {
        validators: [AppValidators.required, AppValidators.mobile],
        // Mobile number identifies a customer at the billing counter, so it must be unique.
        asyncValidators: [
          AppValidators.unique((value) =>
            this.service.isTaken('mobile', value, this.customer()?.id),
          ),
        ],
      },
    ],
    email: ['', [AppValidators.email, Validators.maxLength(100)]],
    address: ['', Validators.maxLength(250)],
    city: ['', Validators.maxLength(60)],
    state: [''],
    pincode: ['', AppValidators.pincode],
    gstNumber: [
      '',
      {
        validators: [AppValidators.gstin, AppValidators.gstinMatchesState('state')],
        asyncValidators: [
          AppValidators.unique((value) =>
            this.service.isTaken('gstNumber', value, this.customer()?.id),
          ),
        ],
      },
    ],
    openingBalance: new FormControl<number | null>(null, AppValidators.money()),
    status: ['active' as EntityStatus],
  });

  protected readonly controller = injectModalForm(this.form);

  constructor() {
    linkGstinWithState(this.form.controls.gstNumber, this.form.controls.state, inject(DestroyRef));
  }

  ngOnInit(): void {
    const customer = this.customer();
    if (customer) {
      this.form.reset({ ...customer });
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const input: CustomerInput = { ...value, openingBalance: value.openingBalance ?? 0 };
    const customer = this.customer();
    const result = await this.controller.submit(() =>
      customer ? this.service.update(customer.id, input) : this.service.create(input),
    );
    if (result) {
      this.saved.emit(result);
    }
  }
}

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

import { SupplierService } from '../../../core/data-access/supplier.service';
import { EntityStatus, STATUS_OPTIONS } from '../../../core/models/base.model';
import { Supplier, SupplierInput } from '../../../core/models/supplier.model';
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
  selector: 'app-supplier-form',
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
  templateUrl: './supplier-form.html',
})
export class SupplierForm implements OnInit {
  readonly supplier = input<Supplier | null>(null);
  readonly saved = output<Supplier>();

  private readonly service = inject(SupplierService);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [
      '',
      {
        validators: [AppValidators.required, Validators.maxLength(100)],
        asyncValidators: [
          AppValidators.unique((value) => this.service.isTaken('name', value, this.supplier()?.id)),
        ],
      },
    ],
    contactPerson: ['', Validators.maxLength(60)],
    mobile: ['', [AppValidators.required, AppValidators.mobile]],
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
            this.service.isTaken('gstNumber', value, this.supplier()?.id),
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
    const supplier = this.supplier();
    if (supplier) {
      this.form.reset({ ...supplier });
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const input: SupplierInput = { ...value, openingBalance: value.openingBalance ?? 0 };
    const supplier = this.supplier();
    const result = await this.controller.submit(() =>
      supplier ? this.service.update(supplier.id, input) : this.service.create(input),
    );
    if (result) {
      this.saved.emit(result);
    }
  }
}

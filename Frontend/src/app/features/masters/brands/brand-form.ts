import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { BrandService } from '../../../core/data-access/brand.service';
import { EntityStatus, STATUS_OPTIONS } from '../../../core/models/base.model';
import { Brand } from '../../../core/models/brand.model';
import { FormFooter } from '../../../shared/components/form-footer/form-footer';
import { FormField } from '../../../shared/components/form-field/form-field';
import { Icon } from '../../../shared/components/icon/icon';
import { SegmentedControl } from '../../../shared/components/segmented-control/segmented-control';
import { AppValidators } from '../../../shared/forms/app-validators';
import { injectModalForm } from '../../../shared/forms/form-submitter';

@Component({
  selector: 'app-brand-form',
  imports: [ReactiveFormsModule, FormField, FormFooter, SegmentedControl, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <form class="modal-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <div class="modal-body">
        @if (controller.error(); as message) {
          <div class="alert alert-danger form-alert" role="alert">
            <app-icon name="exclamation-triangle-fill" /><span>{{ message }}</span>
          </div>
        }
        <div class="form-grid">
          <app-form-field
            label="Brand Name"
            hint="Shown in product dropdowns and on product details."
          >
            <input
              class="form-control"
              formControlName="name"
              maxlength="60"
              autocomplete="off"
              placeholder="e.g. Urban Weave"
              autofocus
            />
          </app-form-field>
          <app-form-field label="Description">
            <textarea
              class="form-control"
              formControlName="description"
              rows="3"
              maxlength="250"
              placeholder="Optional"
            ></textarea>
          </app-form-field>
          <app-form-field label="Status">
            <app-segmented-control
              formControlName="status"
              [options]="statusOptions"
              ariaLabel="Status"
            />
          </app-form-field>
        </div>
      </div>
      <app-form-footer
        [saving]="controller.saving()"
        [submitLabel]="brand() ? 'Save changes' : 'Add brand'"
        (cancel)="controller.cancel()"
      />
    </form>
  `,
})
export class BrandForm implements OnInit {
  readonly brand = input<Brand | null>(null);
  readonly saved = output<Brand>();

  private readonly service = inject(BrandService);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [
      '',
      {
        validators: [AppValidators.required, Validators.maxLength(60)],
        asyncValidators: [
          AppValidators.unique((name) => this.service.isTaken('name', name, this.brand()?.id)),
        ],
      },
    ],
    description: ['', Validators.maxLength(250)],
    status: ['active' as EntityStatus],
  });

  protected readonly controller = injectModalForm(this.form);

  ngOnInit(): void {
    const brand = this.brand();
    if (brand) {
      this.form.reset({
        name: brand.name,
        description: brand.description,
        status: brand.status,
      });
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const brand = this.brand();
    const result = await this.controller.submit(() =>
      brand ? this.service.update(brand.id, value) : this.service.create(value),
    );
    if (result) {
      this.saved.emit(result);
    }
  }
}

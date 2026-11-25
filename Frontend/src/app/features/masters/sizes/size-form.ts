import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { SizeService } from '../../../core/data-access/size.service';
import { EntityStatus, STATUS_OPTIONS } from '../../../core/models/base.model';
import { SIZE_TYPE_OPTIONS, Size, SizeType } from '../../../core/models/size.model';
import { FormFooter } from '../../../shared/components/form-footer/form-footer';
import { FormField } from '../../../shared/components/form-field/form-field';
import { Icon } from '../../../shared/components/icon/icon';
import { SegmentedControl } from '../../../shared/components/segmented-control/segmented-control';
import { AppValidators } from '../../../shared/forms/app-validators';
import { injectModalForm } from '../../../shared/forms/form-submitter';

const NAME_HINTS: Record<SizeType, string> = {
  clothing: 'Letter sizes such as XS, S, M, L, XL, XXL.',
  numeric: 'Numbers such as 28, 30, 32 (waist or chest).',
  custom: 'Anything else, e.g. Free Size, 2-3 Y, 5.5 m.',
};

@Component({
  selector: 'app-size-form',
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
          <app-form-field label="Size Name" [hint]="nameHint()">
            <input
              class="form-control"
              formControlName="name"
              maxlength="20"
              autocomplete="off"
              placeholder="e.g. M, 32 or Free Size"
              autofocus
            />
          </app-form-field>
          <app-form-field label="Size Type">
            <app-segmented-control
              formControlName="type"
              [options]="typeOptions"
              ariaLabel="Size type"
            />
          </app-form-field>
          <app-form-field label="Description">
            <textarea
              class="form-control"
              formControlName="description"
              rows="2"
              maxlength="250"
              placeholder="Optional, e.g. Chest 38–40 in"
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
        [submitLabel]="size() ? 'Save changes' : 'Add size'"
        (cancel)="controller.cancel()"
      />
    </form>
  `,
})
export class SizeForm implements OnInit {
  readonly size = input<Size | null>(null);
  readonly saved = output<Size>();

  private readonly service = inject(SizeService);
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly typeOptions = SIZE_TYPE_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    type: ['clothing' as SizeType],
    name: [
      '',
      {
        validators: [AppValidators.required, Validators.maxLength(20)],
        asyncValidators: [
          AppValidators.unique((name) => this.service.isTaken('name', name, this.size()?.id)),
        ],
      },
    ],
    description: ['', Validators.maxLength(250)],
    status: ['active' as EntityStatus],
  });

  protected readonly controller = injectModalForm(this.form);

  protected nameHint(): string {
    return NAME_HINTS[this.form.controls.type.value];
  }

  ngOnInit(): void {
    const size = this.size();
    if (size) {
      this.form.reset({
        type: size.type,
        name: size.name,
        description: size.description,
        status: size.status,
      });
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const size = this.size();
    const result = await this.controller.submit(() =>
      size ? this.service.update(size.id, value) : this.service.create(value),
    );
    if (result) {
      this.saved.emit(result);
    }
  }
}

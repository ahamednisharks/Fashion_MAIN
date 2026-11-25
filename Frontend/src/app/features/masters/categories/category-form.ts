import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CategoryService } from '../../../core/data-access/category.service';
import { EntityStatus, STATUS_OPTIONS } from '../../../core/models/base.model';
import { Category } from '../../../core/models/category.model';
import { FormFooter } from '../../../shared/components/form-footer/form-footer';
import { FormField } from '../../../shared/components/form-field/form-field';
import { Icon } from '../../../shared/components/icon/icon';
import { SegmentedControl } from '../../../shared/components/segmented-control/segmented-control';
import { AppValidators } from '../../../shared/forms/app-validators';
import { injectModalForm } from '../../../shared/forms/form-submitter';

@Component({
  selector: 'app-category-form',
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
          <app-form-field label="Category Name" hint="Shown in product dropdowns and reports.">
            <input
              class="form-control"
              formControlName="name"
              maxlength="60"
              autocomplete="off"
              placeholder="e.g. Women's Kurtis"
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
        [submitLabel]="category() ? 'Save changes' : 'Add category'"
        (cancel)="controller.cancel()"
      />
    </form>
  `,
})
export class CategoryForm implements OnInit {
  readonly category = input<Category | null>(null);
  readonly saved = output<Category>();

  private readonly service = inject(CategoryService);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [
      '',
      {
        validators: [AppValidators.required, Validators.maxLength(60)],
        asyncValidators: [
          AppValidators.unique((name) => this.service.isTaken('name', name, this.category()?.id)),
        ],
      },
    ],
    description: ['', Validators.maxLength(250)],
    status: ['active' as EntityStatus],
  });

  protected readonly controller = injectModalForm(this.form);

  ngOnInit(): void {
    const category = this.category();
    if (category) {
      this.form.reset({
        name: category.name,
        description: category.description,
        status: category.status,
      });
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const category = this.category();
    const result = await this.controller.submit(() =>
      category ? this.service.update(category.id, value) : this.service.create(value),
    );
    if (result) {
      this.saved.emit(result);
    }
  }
}

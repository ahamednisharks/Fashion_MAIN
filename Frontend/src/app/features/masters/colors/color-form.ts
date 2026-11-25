import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ColorService } from '../../../core/data-access/color.service';
import { EntityStatus, STATUS_OPTIONS } from '../../../core/models/base.model';
import { Color } from '../../../core/models/color.model';
import { normalizeHex } from '../../../core/utils/sku';
import { FormFooter } from '../../../shared/components/form-footer/form-footer';
import { FormField } from '../../../shared/components/form-field/form-field';
import { Icon } from '../../../shared/components/icon/icon';
import { SegmentedControl } from '../../../shared/components/segmented-control/segmented-control';
import { AppValidators } from '../../../shared/forms/app-validators';
import { injectModalForm } from '../../../shared/forms/form-submitter';
import { UppercaseInput } from '../../../shared/forms/uppercase-input.directive';

@Component({
  selector: 'app-color-form',
  imports: [ReactiveFormsModule, FormField, FormFooter, SegmentedControl, Icon, UppercaseInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './color-form.scss',
  host: { style: 'display: contents' },
  template: `
    <form class="modal-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <div class="modal-body">
        @if (controller.error(); as message) {
          <div class="alert alert-danger form-alert" role="alert">
            <app-icon name="exclamation-triangle-fill" /><span>{{ message }}</span>
          </div>
        }
        <div class="color-preview" aria-hidden="true">
          <span
            class="swatch swatch-lg"
            [class.is-empty]="!previewHex()"
            [style.background]="previewHex() || null"
          ></span>
          <span class="preview-text">
            <span class="preview-name">{{ form.controls.name.value || 'Colour preview' }}</span>
            <span class="mono text-muted">{{ previewHex() || 'Enter a HEX code' }}</span>
          </span>
        </div>
        <div class="form-grid cols-2">
          <app-form-field label="Color Name">
            <input
              class="form-control"
              formControlName="name"
              maxlength="40"
              autocomplete="off"
              placeholder="e.g. Navy Blue"
              autofocus
            />
          </app-form-field>
          <app-form-field
            label="Color Code (HEX)"
            hint="Pick a colour or type a code such as #1F2A5A."
          >
            <div class="input-group">
              <input
                #picker
                type="color"
                class="color-picker"
                aria-label="Pick colour"
                [value]="pickerValue()"
                (input)="onPick(picker.value)"
              />
              <input
                class="form-control mono"
                formControlName="hexCode"
                maxlength="7"
                autocomplete="off"
                placeholder="#000000"
                appUppercase
                (blur)="normalize()"
              />
            </div>
          </app-form-field>
          <app-form-field label="Description" class="span-full">
            <textarea
              class="form-control"
              formControlName="description"
              rows="2"
              maxlength="250"
              placeholder="Optional, e.g. Mid grey / heather"
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
        [submitLabel]="color() ? 'Save changes' : 'Add colour'"
        (cancel)="controller.cancel()"
      />
    </form>
  `,
})
export class ColorForm implements OnInit {
  readonly color = input<Color | null>(null);
  readonly saved = output<Color>();

  private readonly service = inject(ColorService);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [
      '',
      {
        validators: [AppValidators.required, Validators.maxLength(40)],
        asyncValidators: [
          AppValidators.unique((name) => this.service.isTaken('name', name, this.color()?.id)),
        ],
      },
    ],
    hexCode: ['', [AppValidators.required, AppValidators.hexColor]],
    description: ['', Validators.maxLength(250)],
    status: ['active' as EntityStatus],
  });

  protected readonly controller = injectModalForm(this.form);

  /** Valid, normalised HEX for the preview ('' while the input is incomplete). */
  protected previewHex(): string {
    return normalizeHex(this.form.controls.hexCode.value);
  }

  /** <input type="color"> needs lowercase #rrggbb. */
  protected pickerValue(): string {
    return (this.previewHex() || '#000000').toLowerCase();
  }

  protected onPick(value: string): void {
    const control = this.form.controls.hexCode;
    control.setValue(value.toUpperCase());
    control.markAsDirty();
    control.markAsTouched();
  }

  protected normalize(): void {
    const control = this.form.controls.hexCode;
    const normalized = normalizeHex(control.value);
    if (normalized && normalized !== control.value) {
      control.setValue(normalized);
    }
  }

  ngOnInit(): void {
    const color = this.color();
    if (color) {
      this.form.reset({
        name: color.name,
        hexCode: color.hexCode,
        description: color.description,
        status: color.status,
      });
    }
  }

  protected async save(): Promise<void> {
    this.normalize();
    const value = this.form.getRawValue();
    const color = this.color();
    const result = await this.controller.submit(() =>
      color ? this.service.update(color.id, value) : this.service.create(value),
    );
    if (result) {
      this.saved.emit(result);
    }
  }
}

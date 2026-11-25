import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { Color } from '../../../core/models/color.model';
import { Size } from '../../../core/models/size.model';
import { Icon } from '../../../shared/components/icon/icon';
import { SizeGroup, groupSizes } from './variant-options';

export interface VariantGenerateRequest {
  readonly designNo: string;
  readonly sizeIds: readonly string[];
  readonly colorIds: readonly string[];
}

/** Creates one variant per selected size × colour for a design / model number. */
@Component({
  selector: 'app-variant-generator',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './variant-generator.scss',
  template: `
    <div class="generator-head">
      <p class="fw-600"><app-icon name="magic" /> Bulk add variants</p>
      <p class="text-muted small">
        Pick sizes and colours — one variant is added for every combination.
      </p>
    </div>

    <label class="field design-field">
      <span class="field-label">Design / Model No.</span>
      <input
        #design
        class="form-control"
        maxlength="30"
        placeholder="Optional, e.g. 101"
        [value]="designNo()"
        (input)="designNo.set(design.value)"
      />
    </label>

    <fieldset class="chip-fieldset">
      <legend class="field-label">
        Sizes <span class="text-muted">({{ sizeIds().size }} selected)</span>
      </legend>
      @for (group of sizeGroups(); track group.type) {
        <div class="chip-row">
          <span class="chip-row-label">{{ group.label }}</span>
          @for (size of group.sizes; track size.id) {
            <label class="chip-toggle">
              <input
                type="checkbox"
                [checked]="sizeIds().has(size.id)"
                (change)="toggle(sizeIds, size.id)"
              />
              {{ size.name }}
            </label>
          }
        </div>
      } @empty {
        <p class="text-muted small">No active sizes. Add sizes in the Size master first.</p>
      }
    </fieldset>

    <fieldset class="chip-fieldset">
      <legend class="field-label">
        Colours <span class="text-muted">({{ colorIds().size }} selected)</span>
      </legend>
      <div class="chip-row">
        @for (color of colors(); track color.id) {
          <label class="chip-toggle">
            <input
              type="checkbox"
              [checked]="colorIds().has(color.id)"
              (change)="toggle(colorIds, color.id)"
            />
            <span class="swatch" [style.background]="color.hexCode"></span>
            {{ color.name }}
          </label>
        } @empty {
          <p class="text-muted small">No active colours. Add colours in the Color master first.</p>
        }
      </div>
    </fieldset>

    <div class="generator-actions">
      <button type="button" class="btn btn-secondary btn-sm" (click)="cancel.emit()">Close</button>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        [disabled]="count() === 0"
        (click)="submit()"
      >
        <app-icon name="plus-lg" />
        Add {{ count() }} {{ count() === 1 ? 'variant' : 'variants' }}
      </button>
    </div>
  `,
})
export class VariantGenerator {
  readonly sizes = input.required<readonly Size[]>();
  readonly colors = input.required<readonly Color[]>();

  readonly generate = output<VariantGenerateRequest>();
  readonly cancel = output<void>();

  protected readonly designNo = signal('');
  protected readonly sizeIds = signal<ReadonlySet<string>>(new Set());
  protected readonly colorIds = signal<ReadonlySet<string>>(new Set());

  protected readonly sizeGroups = computed<SizeGroup[]>(() => groupSizes(this.sizes()));
  protected readonly count = computed(() => this.sizeIds().size * this.colorIds().size);

  protected toggle(target: WritableSignal<ReadonlySet<string>>, id: string): void {
    target.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected submit(): void {
    // Keep the user's selection order consistent with master ordering.
    const sizeIds = this.sizes()
      .filter((size) => this.sizeIds().has(size.id))
      .map((size) => size.id);
    const colorIds = this.colors()
      .filter((color) => this.colorIds().has(color.id))
      .map((color) => color.id);
    this.generate.emit({ designNo: this.designNo().trim(), sizeIds, colorIds });
    this.sizeIds.set(new Set());
    this.colorIds.set(new Set());
  }
}

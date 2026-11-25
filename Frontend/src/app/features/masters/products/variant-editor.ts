import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { Color } from '../../../core/models/color.model';
import { Size } from '../../../core/models/size.model';
import { ToastService } from '../../../core/services/toast.service';
import { buildSku } from '../../../core/utils/sku';
import { normalizeKey, plural } from '../../../core/utils/text';
import { Icon } from '../../../shared/components/icon/icon';
import { UppercaseInput } from '../../../shared/forms/uppercase-input.directive';
import { validationMessage } from '../../../shared/forms/validation-messages';
import {
  VariantFormGroup,
  VariantFormValue,
  VariantRowIssues,
  createVariantGroup,
} from './product-form.model';
import { VariantGenerateRequest, VariantGenerator } from './variant-generator';
import { groupSizes } from './variant-options';

interface VariantRowView {
  readonly group: VariantFormGroup;
  readonly index: number;
  readonly title: string;
  readonly hex: string;
  readonly messages: readonly string[];
}

const FIELD_LABELS: readonly (readonly [keyof VariantFormGroup['controls'], string])[] = [
  ['designNo', 'Design No.'],
  ['sizeId', 'Size'],
  ['colorId', 'Colour'],
  ['sku', 'SKU'],
  ['barcode', 'Barcode'],
  ['purchasePrice', 'Purchase price'],
  ['sellingPrice', 'Selling price'],
  ['mrp', 'MRP'],
];

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function comboKey(value: Pick<VariantFormValue, 'designNo' | 'sizeId' | 'colorId'>): string {
  return [normalizeKey(value.designNo), value.sizeId, value.colorId].join('|');
}

/**
 * Editable list of product variants (design / size / colour / SKU / barcode / price overrides).
 * Renders as a compact grid on wide screens and as cards on smaller screens.
 */
@Component({
  selector: 'app-variant-editor',
  imports: [ReactiveFormsModule, Icon, UppercaseInput, VariantGenerator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './variant-editor.html',
  styleUrl: './variant-editor.scss',
})
export class VariantEditor {
  readonly variants = input.required<FormArray<VariantFormGroup>>();
  /** Selectable sizes / colours (active ones plus any already used by this product). */
  readonly sizes = input.required<readonly Size[]>();
  readonly colors = input.required<readonly Color[]>();
  readonly productCode = input('');
  readonly baseMrp = input<number | null>(null);
  readonly baseSelling = input<number | null>(null);
  readonly basePurchase = input<number | null>(null);
  /** Saved variant to highlight (opened from the Items screen). */
  readonly highlightId = input('');

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** SKUs this editor generated, so it only overwrites SKUs the user hasn't edited by hand. */
  private readonly autoSkus = new WeakMap<VariantFormGroup, string>();
  /** Bumped on every form event so computed views re-evaluate. */
  private readonly formVersion = signal(0);

  protected readonly showGenerator = signal(false);
  protected readonly sizeGroups = computed(() => groupSizes(this.sizes()));
  protected readonly activeSizes = computed(() =>
    this.sizes().filter((s) => s.status === 'active'),
  );
  protected readonly activeColors = computed(() =>
    this.colors().filter((c) => c.status === 'active'),
  );
  private readonly sizeById = computed(() => new Map(this.sizes().map((s) => [s.id, s])));
  private readonly colorById = computed(() => new Map(this.colors().map((c) => [c.id, c])));

  protected readonly rows = computed<VariantRowView[]>(() => {
    this.formVersion();
    const array = this.variants();
    const issues: VariantRowIssues = array.errors?.['variantRows'] ?? {};
    return array.controls.map((group, index) => {
      const value = group.getRawValue();
      const size = this.sizeById().get(value.sizeId);
      const color = this.colorById().get(value.colorId);
      const fieldMessages = FIELD_LABELS.flatMap(([key, label]) => {
        const control = group.controls[key];
        const message = control.touched ? validationMessage(control.errors, label) : null;
        return message ? [message] : [];
      });
      return {
        group,
        index,
        title:
          [value.designNo, color?.name, size?.name].filter(Boolean).join(' / ') || 'New variant',
        hex: color?.hexCode ?? '',
        messages: [...fieldMessages, ...(issues[index] ?? [])],
      };
    });
  });

  constructor() {
    effect((onCleanup) => {
      const subscription = this.variants().events.subscribe(() =>
        this.formVersion.update((version) => version + 1),
      );
      onCleanup(() => subscription.unsubscribe());
    });

    // Product code is part of the SKU — keep auto-generated SKUs in sync with it.
    effect(() => {
      this.productCode();
      untracked(() => this.variants().controls.forEach((group) => this.refreshSku(group)));
    });
  }

  protected pricePlaceholder(base: number | null): string {
    return base === null ? 'Default' : inr.format(base);
  }

  protected inactiveSuffix(status: string): string {
    return status === 'inactive' ? ' (inactive)' : '';
  }

  /** Regenerates the SKU unless the user typed their own. */
  protected refreshSku(group: VariantFormGroup): void {
    const { designNo, sizeId, colorId, sku } = group.getRawValue();
    const size = this.sizeById().get(sizeId);
    const color = this.colorById().get(colorId);
    if (!size || !color) {
      return;
    }
    const next = buildSku({
      productCode: this.productCode(),
      designNo,
      colorName: color.name,
      sizeName: size.name,
    });
    if (!sku || sku === this.autoSkus.get(group)) {
      group.controls.sku.setValue(next);
      this.autoSkus.set(group, next);
    }
  }

  protected addVariant(): void {
    const array = this.variants();
    const last = array.length ? array.at(array.length - 1).getRawValue() : null;
    array.push(createVariantGroup(this.fb, { designNo: last?.designNo ?? '' }));
    array.markAsDirty();
    this.focusRow(array.length - 1);
  }

  protected duplicateVariant(index: number): void {
    const array = this.variants();
    const source = array.at(index).getRawValue();
    array.insert(
      index + 1,
      createVariantGroup(this.fb, { ...source, id: '', sku: '', barcode: '' }),
    );
    array.markAsDirty();
    this.focusRow(index + 1, 'select');
  }

  protected removeVariant(index: number): void {
    const array = this.variants();
    array.removeAt(index);
    array.markAsDirty();
  }

  protected generate(request: VariantGenerateRequest): void {
    const array = this.variants();
    const existing = new Set(array.controls.map((group) => comboKey(group.getRawValue())));
    let added = 0;
    let skipped = 0;
    for (const colorId of request.colorIds) {
      for (const sizeId of request.sizeIds) {
        const key = comboKey({ designNo: request.designNo, sizeId, colorId });
        if (existing.has(key)) {
          skipped++;
          continue;
        }
        existing.add(key);
        const group = createVariantGroup(this.fb, { designNo: request.designNo, sizeId, colorId });
        array.push(group, { emitEvent: false });
        this.refreshSku(group);
        added++;
      }
    }
    array.updateValueAndValidity();
    array.markAsDirty();

    if (added) {
      this.toast.success(
        `${plural(added, 'variant')} added${skipped ? ` (${skipped} already existed)` : ''}.`,
      );
    } else {
      this.toast.info('All selected combinations already exist.');
    }
  }

  private focusRow(index: number, selector = 'input, select'): void {
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelectorAll('.variant-row')[index];
        row?.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this.injector },
    );
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

import { Icon } from '../../../shared/components/icon/icon';
import {
  DateRange,
  RANGE_PRESETS,
  RangePreset,
  isoDate,
  matchingPreset,
  presetRange,
  rangeError,
} from '../date-range';

/**
 * A report's period: quick presets (Today … This FY) and From / To dates. Typed dates are
 * applied once they make a valid period; until then the error is shown and `rangeChange`
 * stays quiet.
 */
@Component({
  selector: 'app-period-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './period-picker.scss',
  host: { class: 'card period-card no-print', role: 'group', 'aria-label': 'Report period' },
  template: `
    <div class="period-presets" role="group" aria-label="Quick periods">
      @for (preset of presets; track preset.value) {
        <button
          type="button"
          class="preset"
          [class.is-active]="activePreset() === preset.value"
          [attr.aria-pressed]="activePreset() === preset.value"
          (click)="applyPreset(preset.value)"
        >
          {{ preset.label }}
        </button>
      }
    </div>
    <div class="period-dates">
      <label class="field">
        <span class="field-label">From</span>
        <input
          #fromInput
          type="date"
          class="form-control"
          [value]="draftFrom()"
          [max]="today"
          [attr.aria-invalid]="draftError() ? true : null"
          (change)="setFrom(fromInput.value)"
        />
      </label>
      <label class="field">
        <span class="field-label">To</span>
        <input
          #toInput
          type="date"
          class="form-control"
          [value]="draftTo()"
          [attr.aria-invalid]="draftError() ? true : null"
          (change)="setTo(toInput.value)"
        />
      </label>
    </div>
    @if (draftError(); as message) {
      <p class="field-error period-error" role="alert">
        <app-icon name="exclamation-circle" /><span>{{ message }}</span>
      </p>
    }
  `,
})
export class PeriodPicker {
  /** The period on screen. */
  readonly range = input.required<DateRange>();
  readonly rangeChange = output<DateRange>();

  protected readonly presets = RANGE_PRESETS;
  protected readonly today = isoDate(new Date());

  /** What is typed in the date boxes (applied once it is a valid period). */
  protected readonly draftFrom = signal('');
  protected readonly draftTo = signal('');
  protected readonly draftError = computed(() =>
    rangeError({ from: this.draftFrom(), to: this.draftTo() }),
  );
  protected readonly activePreset = computed(() => matchingPreset(this.range()));

  constructor() {
    // A new period from outside (preset, URL, reset) replaces whatever was typed.
    effect(() => {
      const { from, to } = this.range();
      this.draftFrom.set(from);
      this.draftTo.set(to);
    });
  }

  protected applyPreset(preset: RangePreset): void {
    this.emit(presetRange(preset));
  }

  protected setFrom(value: string): void {
    this.draftFrom.set(value);
    this.applyDraft();
  }

  protected setTo(value: string): void {
    this.draftTo.set(value);
    this.applyDraft();
  }

  private applyDraft(): void {
    if (!this.draftError()) {
      this.emit({ from: this.draftFrom(), to: this.draftTo() });
    }
  }

  private emit(range: DateRange): void {
    this.draftFrom.set(range.from);
    this.draftTo.set(range.to);
    const current = this.range();
    if (current.from !== range.from || current.to !== range.to) {
      this.rangeChange.emit(range);
    }
  }
}

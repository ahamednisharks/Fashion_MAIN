import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * Compact single-choice control (radio group semantics) for short option lists such as
 * Status (Active / Inactive) or Size Type. Works with reactive forms.
 */
@Component({
  selector: 'app-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './segmented-control.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SegmentedControl), multi: true },
  ],
  host: { role: 'radiogroup', '[attr.aria-label]': 'ariaLabel() || null' },
  template: `
    @for (option of options(); track option.value; let index = $index) {
      <button
        type="button"
        role="radio"
        class="segment"
        [class.is-selected]="option.value === value()"
        [attr.aria-checked]="option.value === value()"
        [attr.tabindex]="isFocusable(option.value, index) ? 0 : -1"
        [disabled]="disabled()"
        (click)="select(option.value)"
        (keydown)="onKeydown($event, index)"
        (blur)="onTouched()"
      >
        {{ option.label }}
      </button>
    }
  `,
})
export class SegmentedControl<T extends string> implements ControlValueAccessor {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly ariaLabel = input('');

  protected readonly value = signal<T | null>(null);
  protected readonly disabled = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private onChange: (value: T) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: T | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected isFocusable(value: T, index: number): boolean {
    const current = this.value();
    return current === null ? index === 0 : current === value;
  }

  protected select(value: T): void {
    if (value !== this.value()) {
      this.value.set(value);
      this.onChange(value);
    }
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    const options = this.options();
    const next = (index + delta + options.length) % options.length;
    this.select(options[next].value);
    this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.segment')[next]?.focus();
  }
}

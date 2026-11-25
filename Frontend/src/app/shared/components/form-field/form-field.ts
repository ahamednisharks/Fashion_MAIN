import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  computed,
  contentChild,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NgControl, ValidationErrors, Validators } from '@angular/forms';

import { AppValidators } from '../../forms/app-validators';
import { validationMessage } from '../../forms/validation-messages';
import { Icon } from '../icon/icon';

let nextFieldId = 0;

interface ControlState {
  readonly errors: ValidationErrors | null;
  readonly touched: boolean;
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly required: boolean;
}

/** Errors worth showing while the user is still typing (before the field loses focus). */
const LIVE_ERRORS = ['duplicate', 'server'];

/**
 * Label + control + hint/error wrapper.
 *
 *   <app-form-field label="Category Name" hint="Shown on bills">
 *     <input class="form-control" formControlName="name" />
 *   </app-form-field>
 *
 * Wires up `for`/`id`, `aria-invalid` and `aria-describedby` automatically, detects required
 * validators, and shows the first validation message once the control is touched. Duplicate
 * and server errors show immediately so staff notice them while typing.
 */
@Component({
  selector: 'app-form-field',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'field', '[class.has-error]': '!!error()' },
  template: `
    <label class="field-label" [attr.for]="controlId()">
      {{ label() }}
      @if (isRequired()) {
        <span class="req" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (error(); as message) {
      <p class="field-error" [id]="messageId">
        <app-icon name="exclamation-circle" />{{ message }}
      </p>
    } @else if (state().pending && state().dirty) {
      <p class="field-hint" [id]="messageId"><span class="spinner"></span>Checking…</p>
    } @else if (hint()) {
      <p class="field-hint" [id]="messageId">{{ hint() }}</p>
    }
  `,
})
export class FormField implements AfterContentInit {
  readonly label = input.required<string>();
  readonly hint = input('');
  /** Overrides automatic required detection. */
  readonly required = input<boolean | undefined>(undefined);
  /** Explicit control, for custom controls that are not bound with formControlName. */
  readonly control = input<AbstractControl | null>(null);

  private readonly ngControl = contentChild(NgControl, { descendants: true });
  private readonly ngControlElement = contentChild(NgControl, {
    descendants: true,
    read: ElementRef,
  });
  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly messageId = `field-msg-${nextFieldId}`;
  protected readonly controlId = signal(`field-${nextFieldId++}`);
  protected readonly state = signal<ControlState>({
    errors: null,
    touched: false,
    dirty: false,
    pending: false,
    required: false,
  });

  protected readonly isRequired = computed(() => this.required() ?? this.state().required);
  protected readonly error = computed(() => {
    const { errors, touched, dirty } = this.state();
    const live = dirty && !!errors && LIVE_ERRORS.some((key) => key in errors);
    return touched || live ? validationMessage(errors, this.label()) : null;
  });

  constructor() {
    effect(() => {
      const element = this.ngControlElement()?.nativeElement;
      if (element instanceof HTMLElement) {
        const invalid = !!this.error();
        this.renderer.setAttribute(element, 'aria-invalid', String(invalid));
        this.renderer.setAttribute(element, 'aria-describedby', this.messageId);
      }
    });
  }

  ngAfterContentInit(): void {
    const element = this.ngControlElement()?.nativeElement;
    if (element instanceof HTMLElement) {
      if (element.id) {
        this.controlId.set(element.id);
      } else {
        element.id = this.controlId();
      }
    }

    const control = this.control() ?? this.ngControl()?.control;
    if (!control) {
      return;
    }
    const sync = () =>
      this.state.set({
        errors: control.errors,
        touched: control.touched,
        dirty: control.dirty,
        pending: control.pending,
        required:
          control.hasValidator(Validators.required) || control.hasValidator(AppValidators.required),
      });
    sync();
    control.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(sync);
  }
}

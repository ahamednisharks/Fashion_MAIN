import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/** Lower-cases input as the user types (usernames) while preserving the caret. */
@Directive({
  selector: 'input[appLowercase]',
  host: {
    '(input)': 'onInput()',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
  },
})
export class LowercaseInput {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  protected onInput(): void {
    const input = this.element.nativeElement;
    const lower = input.value.toLowerCase();
    if (lower === input.value) {
      return;
    }
    const { selectionStart, selectionEnd } = input;
    input.value = lower;
    input.setSelectionRange(selectionStart, selectionEnd);
    this.ngControl?.control?.setValue(lower, { emitModelToViewChange: false });
  }
}

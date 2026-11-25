import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/** Upper-cases input as the user types (GST numbers, codes, SKUs) while preserving the caret. */
@Directive({
  selector: 'input[appUppercase]',
  host: { '(input)': 'onInput()', autocapitalize: 'characters', spellcheck: 'false' },
})
export class UppercaseInput {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  protected onInput(): void {
    const input = this.element.nativeElement;
    const upper = input.value.toUpperCase();
    if (upper === input.value) {
      return;
    }
    const { selectionStart, selectionEnd } = input;
    input.value = upper;
    input.setSelectionRange(selectionStart, selectionEnd);
    this.ngControl?.control?.setValue(upper, { emitModelToViewChange: false });
  }
}

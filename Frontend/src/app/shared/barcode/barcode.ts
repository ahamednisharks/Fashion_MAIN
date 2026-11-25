import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { barcodePattern } from './barcode-pattern';

/**
 * A printable barcode drawn as SVG (black bars on white, quiet zones included). The width is
 * `module` mm per bar module, reduced to fit `maxWidth` mm; the height fills the parent unless
 * `height` (mm) is given. Renders nothing for text that cannot be encoded.
 */
@Component({
  selector: 'app-barcode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pattern(); as barcode) {
      <svg
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        [attr.aria-label]="'Barcode ' + value()"
        [attr.viewBox]="'0 0 ' + barcode.width + ' 100'"
        preserveAspectRatio="none"
        shape-rendering="crispEdges"
        [style.width.mm]="widthMm()"
        [style.height]="height() ? height() + 'mm' : '100%'"
      >
        <rect [attr.width]="barcode.width" height="100" fill="#fff" />
        @for (bar of barcode.bars; track bar.x) {
          <rect [attr.x]="bar.x" y="0" [attr.width]="bar.width" height="100" fill="#000" />
        }
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      justify-content: center;
      max-width: 100%;
    }
    svg {
      display: block;
    }
  `,
})
export class Barcode {
  readonly value = input.required<string>();
  /** Millimetres per module (the narrowest bar). */
  readonly module = input(0.33);
  /** Widest the barcode may be, in mm. */
  readonly maxWidth = input(48);
  /** Height in mm; empty = fill the parent's height. */
  readonly height = input<number | null>(null);

  protected readonly pattern = computed(() => barcodePattern(this.value()));
  protected readonly widthMm = computed(() => {
    const pattern = this.pattern();
    return pattern ? Math.min(pattern.width * this.module(), this.maxWidth()) : 0;
  });
}

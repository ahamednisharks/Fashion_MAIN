import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
} from '@angular/core';

import { LabelOptions } from '../../core/models/item.model';
import { LABEL_LAYOUTS, LabelData, paginateLabels } from './label-layouts';
import { PriceLabel } from './price-label';

/**
 * The labels to print, laid out page by page at real size. Hidden on screen; print() moves it to
 * <body> and adds the `print-labels` class there (see styles/_print.scss) plus an @page rule with
 * the label stock's size, so the print view shows nothing else.
 */
@Component({
  selector: 'app-label-sheet',
  imports: [PriceLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'label-print' },
  template: `
    @for (page of pages(); track $index; let last = $last) {
      <div
        class="page"
        [class.is-last]="last"
        [style.width.mm]="spec().pageWidth"
        [style.height.mm]="spec().pageHeight"
        [style.padding-top.mm]="spec().marginTop"
        [style.padding-left.mm]="spec().marginLeft"
        [style.grid-template-columns]="
          'repeat(' + spec().columns + ', ' + spec().labelWidth + 'mm)'
        "
        [style.grid-auto-rows.mm]="spec().labelHeight"
        [style.column-gap.mm]="spec().gapX"
        [style.row-gap.mm]="spec().gapY"
      >
        @for (cell of page; track $index) {
          @if (cell) {
            <app-price-label
              [data]="cell"
              [options]="options()"
              [spec]="spec()"
              [shopName]="shopName()"
            />
          } @else {
            <span></span>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: none;
    }
    .page {
      box-sizing: border-box;
      display: grid;
      align-content: start;
      overflow: hidden;
      break-after: page;
      background: #fff;

      &.is-last {
        break-after: auto;
      }
    }
  `,
})
export class LabelSheet {
  readonly labels = input.required<readonly LabelData[]>();
  readonly options = input.required<LabelOptions>();
  readonly shopName = input('');
  /** First label position on a sheet (1-based); ignored for rolls. */
  readonly startAt = input(1);

  protected readonly spec = computed(() => LABEL_LAYOUTS[this.options().labelLayout]);
  protected readonly pages = computed(() =>
    paginateLabels(this.labels(), this.spec(), this.startAt()),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // Once moved, Angular no longer removes the element with the page — do it here.
    inject(DestroyRef).onDestroy(() => this.host.remove());
  }

  /**
   * Prints the labels on their own (call after they have rendered). The page size is the label
   * stock's, with no margins. `afterPrint` runs once the print dialog closes.
   */
  print(afterPrint?: () => void): void {
    if (this.host.parentElement !== document.body) {
      document.body.appendChild(this.host);
    }
    const spec = this.spec();
    const pageStyle = document.createElement('style');
    pageStyle.textContent = `@page { size: ${spec.pageWidth}mm ${spec.pageHeight}mm; margin: 0; }`;
    document.head.appendChild(pageStyle);
    const body = document.body;
    body.classList.add('print-labels');
    const done = () => {
      body.classList.remove('print-labels');
      pageStyle.remove();
      afterPrint?.();
    };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
  }
}

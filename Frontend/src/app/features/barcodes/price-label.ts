import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LabelOptions } from '../../core/models/item.model';
import { Barcode } from '../../shared/barcode/barcode';
import { LabelData, LabelLayoutSpec } from './label-layouts';

/**
 * One price label, drawn at its real size in millimetres (used for the on-screen preview and
 * for printing). Black on white only, so it prints the same on thermal and laser printers.
 */
@Component({
  selector: 'app-price-label',
  imports: [Barcode, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="label"
      [class.compact]="spec().compact"
      [style.width.mm]="spec().labelWidth"
      [style.height.mm]="spec().labelHeight"
    >
      @if (options().showShopName && shopName()) {
        <div class="line shop">{{ shopName() }}</div>
      }
      @if (options().showProductName) {
        <div class="line name">{{ data().productName }}</div>
      }
      @if (options().showDetails && data().details) {
        <div class="line details">{{ data().details }}</div>
      }
      <div class="bars">
        <app-barcode
          [value]="data().barcode"
          [module]="spec().module"
          [maxWidth]="spec().labelWidth - 3"
        />
      </div>
      <div class="line code">{{ data().barcode }}</div>
      @if (options().showMrp || showPrice()) {
        <div class="line price">
          @if (options().showMrp) {
            <span class="mrp">MRP ₹{{ data().mrp | number: '1.2-2' }}</span>
          }
          @if (showPrice()) {
            <span class="sell"
              >{{ options().showMrp ? 'Price' : '' }} ₹{{ data().price | number: '1.2-2' }}</span
            >
          }
          @if (options().showMrp && !showPrice()) {
            <span class="tax">incl. of all taxes</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .label {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1mm 1.5mm;
      overflow: hidden;
      color: #000;
      background: #fff;
      font-family: Arial, 'Segoe UI', sans-serif;
      font-size: 7pt;
      line-height: 1.15;
      text-align: center;
    }
    .line {
      flex: none;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .shop {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .details {
      font-size: 6.5pt;
    }
    .bars {
      display: flex;
      flex: 1 1 auto;
      justify-content: center;
      width: 100%;
      min-height: 4mm;
      margin-top: 0.4mm;
    }
    .code {
      font-family: Consolas, 'Courier New', monospace;
      font-size: 7pt;
      letter-spacing: 0.06em;
    }
    .price {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 1.2mm;
      font-size: 8pt;
      font-weight: 700;
    }
    .tax {
      font-size: 4.5pt;
      font-weight: 400;
    }
    .compact {
      padding: 0.8mm 1mm;
      font-size: 6pt;

      .shop,
      .details {
        font-size: 5.5pt;
      }
      .code {
        font-size: 6pt;
        letter-spacing: 0.03em;
      }
      .price {
        gap: 0.8mm;
        font-size: 6.5pt;
      }
      .tax {
        font-size: 4pt;
      }
    }
  `,
})
export class PriceLabel {
  readonly data = input.required<LabelData>();
  readonly options = input.required<LabelOptions>();
  readonly spec = input.required<LabelLayoutSpec>();
  readonly shopName = input('');

  /** The selling price is shown when asked for and when it differs from the MRP. */
  protected readonly showPrice = computed(
    () =>
      this.options().showSellingPrice &&
      (!this.options().showMrp || this.data().price < this.data().mrp),
  );
}

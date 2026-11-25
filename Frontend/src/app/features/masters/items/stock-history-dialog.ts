import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { StockService } from '../../../core/data-access/stock.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SellableItem, itemDetails } from '../../../core/models/sale.model';
import { STOCK_KIND_LABELS, StockHistory, StockMovement } from '../../../core/models/stock.model';
import { Modal } from '../../../shared/components/modal/modal';
import { ErrorState } from '../../../shared/components/state-views/state-views';

/**
 * An item's stock card: quantity in hand and its movements (newest first) — which purchase
 * entry brought goods in, which bill took them out, and the balance after each.
 */
@Component({
  selector: 'app-stock-history-dialog',
  imports: [DatePipe, DecimalPipe, RouterLink, Modal, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Stock history" size="lg" [dismissible]="true" (closed)="closed.emit()">
      <div class="modal-body">
        <div class="stock-head">
          <div>
            <p class="fw-600">{{ item().productName }}</p>
            <p class="small text-muted">
              @if (details) {
                {{ details }} ·
              }
              <span class="mono">{{ item().sku }}</span>
            </p>
          </div>
          @if (history(); as h) {
            <div class="stock-now" [class.is-negative]="h.stock < 0">
              <span class="xsmall text-muted">In stock</span>
              <strong>{{ h.stock | number: '1.0-3' }}</strong>
            </div>
          }
        </div>

        @if (error(); as message) {
          <app-error-state heading="Couldn't load the stock" [message]="message" (retry)="load()" />
        } @else if (!history()) {
          <p class="text-muted flex-row">
            <span class="spinner" aria-hidden="true"></span> Loading…
          </p>
        } @else if (!history()!.movements.length) {
          <p class="text-muted empty-note">
            No stock movements yet — goods come in with purchase entries, go out with bills and are
            corrected with stock adjustments.
          </p>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Document</th>
                  <th class="text-end">In</th>
                  <th class="text-end">Out</th>
                  <th class="text-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (movement of history()!.movements; track $index) {
                  <tr>
                    <td class="nowrap">{{ movement.date | date: 'dd MMM y' }}</td>
                    <td class="nowrap">
                      <span class="text-muted small">{{ kindLabels[movement.kind] }}</span>
                      @if (linkOf(movement); as link) {
                        <a class="mono small doc-no" [routerLink]="link" (click)="closed.emit()">{{
                          movement.sourceNo
                        }}</a>
                      } @else {
                        <span class="mono small doc-no">{{ movement.sourceNo }}</span>
                      }
                    </td>
                    <td class="text-end text-success">
                      {{ movement.quantity > 0 ? (movement.quantity | number: '1.0-3') : '' }}
                    </td>
                    <td class="text-end">
                      {{ movement.quantity < 0 ? (-movement.quantity | number: '1.0-3') : '' }}
                    </td>
                    <td class="text-end fw-600" [class.text-danger]="movement.balance < 0">
                      {{ movement.balance | number: '1.0-3' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (history()!.totalMovements > history()!.movements.length) {
            <p class="xsmall text-muted more-note">
              Showing the latest {{ history()!.movements.length }} of
              {{ history()!.totalMovements }} movements.
            </p>
          }
        }
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Close</button>
      </div>
    </app-modal>
  `,
  styles: `
    .stock-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;

      p {
        margin: 0;
      }
    }

    .stock-now {
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      strong {
        font-size: var(--fs-xl);
        line-height: 1.1;
      }

      &.is-negative strong {
        color: var(--c-danger);
      }
    }

    .doc-no {
      margin-left: 6px;
    }

    .empty-note,
    .more-note {
      margin: 8px 0 0;
    }
  `,
})
export class StockHistoryDialog implements OnInit {
  readonly item = input.required<SellableItem>();
  readonly closed = output<void>();

  private readonly stock = inject(StockService);
  private readonly isAdmin = inject(AuthService).isAdmin;

  protected readonly history = signal<StockHistory | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly kindLabels = STOCK_KIND_LABELS;
  protected details = '';

  ngOnInit(): void {
    this.details = itemDetails(this.item());
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const item = this.item();
      this.history.set(await firstValueFrom(this.stock.history(item.productId, item.variantId)));
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }

  /** Purchase entries open in Purchase (administrators only); bills have no page of their own. */
  protected linkOf(movement: StockMovement): unknown[] | null {
    if (!this.isAdmin()) return null;
    switch (movement.sourceType) {
      case 'purchase_entry':
        return ['/purchase/entries', movement.sourceId];
      case 'stock_adjustment':
        return ['/masters/stock-adjustment', movement.sourceId];
      default:
        return null;
    }
  }
}

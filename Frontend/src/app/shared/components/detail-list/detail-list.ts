import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { EntityStatus } from '../../../core/models/base.model';
import { StatusBadge } from '../status-badge/status-badge';

export type DetailItem =
  | {
      readonly label: string;
      readonly type: 'status';
      readonly value: EntityStatus;
      readonly full?: boolean;
    }
  | {
      readonly label: string;
      readonly type: 'color';
      readonly value: string;
      readonly full?: boolean;
    }
  | {
      readonly label: string;
      readonly type: 'currency';
      readonly value: number | null;
      readonly full?: boolean;
    }
  | {
      readonly label: string;
      readonly type: 'datetime';
      readonly value: string;
      readonly full?: boolean;
    }
  | {
      readonly label: string;
      readonly type?: 'text' | 'multiline' | 'mono';
      readonly value: string | number | null | undefined;
      readonly full?: boolean;
    };

/** Read-only label/value grid used by "View" dialogs and detail pages. */
@Component({
  selector: 'app-detail-list',
  imports: [StatusBadge, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './detail-list.scss',
  template: `
    <dl class="detail-grid">
      @for (item of items(); track item.label) {
        <div class="detail-item" [class.is-full]="item.full || item.type === 'multiline'">
          <dt>{{ item.label }}</dt>
          <dd>
            @switch (item.type) {
              @case ('status') {
                <app-status-badge [status]="item.value" />
              }
              @case ('color') {
                <span class="flex-row">
                  <span class="swatch" [style.background]="item.value"></span>
                  <span class="mono">{{ item.value }}</span>
                </span>
              }
              @case ('currency') {
                @if (item.value === null) {
                  <span class="text-muted">—</span>
                } @else {
                  ₹{{ item.value | number: '1.2-2' }}
                }
              }
              @case ('datetime') {
                {{ item.value | date: 'dd MMM yyyy, h:mm a' }}
              }
              @default {
                @if (item.value === null || item.value === undefined || item.value === '') {
                  <span class="text-muted">—</span>
                } @else {
                  <span
                    [class.mono]="item.type === 'mono'"
                    [class.pre-line]="item.type === 'multiline'"
                    >{{ item.value }}</span
                  >
                }
              }
            }
          </dd>
        </div>
      }
    </dl>
  `,
})
export class DetailList {
  readonly items = input.required<readonly DetailItem[]>();
}

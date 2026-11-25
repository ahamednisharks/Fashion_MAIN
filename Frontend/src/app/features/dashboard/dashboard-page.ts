import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { toApiError } from '../../core/data-access/api.types';
import { Icon } from '../../shared/components/icon/icon';
import { IconName } from '../../shared/components/icon/icon-registry';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ErrorState } from '../../shared/components/state-views/state-views';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { DashboardService, DashboardSummary } from './dashboard.service';

interface StatTile {
  readonly label: string;
  readonly icon: IconName;
  readonly value: number;
  readonly detail: string;
  readonly link: string;
}

interface QuickAction {
  readonly label: string;
  readonly icon: IconName;
  readonly link: string;
  readonly queryParams?: Record<string, string>;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CurrencyPipe, Icon, PageHeader, ErrorState, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly dashboard = inject(DashboardService);

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly skeletonTiles = [0, 1, 2, 3, 4, 5];

  protected readonly quickActions: readonly QuickAction[] = [
    { label: 'New product', icon: 'box-seam', link: '/masters/products/new' },
    {
      label: 'Add customer',
      icon: 'people',
      link: '/masters/customers',
      queryParams: { action: 'new' },
    },
    {
      label: 'Add supplier',
      icon: 'truck',
      link: '/masters/suppliers',
      queryParams: { action: 'new' },
    },
    {
      label: 'Add category',
      icon: 'tags',
      link: '/masters/categories',
      queryParams: { action: 'new' },
    },
  ];

  protected readonly tiles = computed<StatTile[]>(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }
    return [
      {
        label: 'Products',
        icon: 'box-seam',
        value: s.products.total,
        detail: `${s.variants} variants`,
        link: '/masters/products',
      },
      {
        label: 'Customers',
        icon: 'people',
        value: s.customers.total,
        detail: `${s.customers.active} active`,
        link: '/masters/customers',
      },
      {
        label: 'Suppliers',
        icon: 'truck',
        value: s.suppliers.total,
        detail: `${s.suppliers.active} active`,
        link: '/masters/suppliers',
      },
      {
        label: 'Categories',
        icon: 'tags',
        value: s.categories.total,
        detail: `${s.categories.active} active`,
        link: '/masters/categories',
      },
      {
        label: 'Brands',
        icon: 'award',
        value: s.brands.total,
        detail: `${s.brands.active} active`,
        link: '/masters/brands',
      },
      {
        label: 'Sizes & Colours',
        icon: 'palette',
        value: s.sizes.total + s.colors.total,
        detail: `${s.sizes.total} sizes · ${s.colors.total} colours`,
        link: '/masters/sizes',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.dashboard.getSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.loading.set(false);
      },
    });
  }
}

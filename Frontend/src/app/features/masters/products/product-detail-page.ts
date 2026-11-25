import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { ProductService } from '../../../core/data-access/product.service';
import { Product, productTypeLabel } from '../../../core/models/product.model';
import { CrudActionsService } from '../../../core/services/crud-actions.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { compareSizes } from '../../../core/utils/size-order';
import { DetailItem, DetailList } from '../../../shared/components/detail-list/detail-list';
import { Icon } from '../../../shared/components/icon/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { ProductLookups, ProductLookupsService } from './product-lookups';

type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

interface VariantView {
  readonly id: string;
  readonly designNo: string;
  readonly sizeName: string;
  readonly colorName: string;
  readonly hex: string;
  readonly sku: string;
  readonly barcode: string;
  readonly purchasePrice: number | null;
  readonly sellingPrice: number;
  readonly mrp: number;
  readonly overrides: {
    readonly purchase: boolean;
    readonly selling: boolean;
    readonly mrp: boolean;
  };
}

@Component({
  selector: 'app-product-detail-page',
  imports: [
    RouterLink,
    CurrencyPipe,
    PageHeader,
    DetailList,
    Icon,
    StatusBadge,
    ErrorState,
    EmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail-page.html',
  styleUrl: './product-detail-page.scss',
})
export class ProductDetailPage {
  readonly id = input.required<string>();

  private readonly productService = inject(ProductService);
  private readonly lookupsService = inject(ProductLookupsService);
  private readonly crud = inject(CrudActionsService);
  private readonly pageMeta = inject(PageMetaService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly product = signal<Product | null>(null);
  private readonly lookups = signal<ProductLookups | null>(null);

  protected readonly categoryName = computed(() =>
    this.nameOf('categories', this.product()?.categoryId),
  );
  protected readonly brandName = computed(() => this.nameOf('brands', this.product()?.brandId));
  protected readonly typeLabel = computed(() => {
    const product = this.product();
    return product ? productTypeLabel(product.productType) : '';
  });

  protected readonly pricing = computed<DetailItem[]>(() => {
    const product = this.product();
    if (!product) {
      return [];
    }
    const margin =
      product.purchasePrice !== null && product.sellingPrice > 0
        ? `₹${(product.sellingPrice - product.purchasePrice).toFixed(2)} (${(((product.sellingPrice - product.purchasePrice) / product.sellingPrice) * 100).toFixed(1)}%)`
        : '';
    return [
      { label: 'MRP', type: 'currency', value: product.mrp },
      { label: 'Selling Price', type: 'currency', value: product.sellingPrice },
      { label: 'Purchase Price', type: 'currency', value: product.purchasePrice },
      { label: 'Margin', value: margin },
      { label: 'GST Rate', value: `${product.gstRate}%` },
      { label: 'HSN Code', type: 'mono', value: product.hsnCode },
    ];
  });

  protected readonly identification = computed<DetailItem[]>(() => {
    const product = this.product();
    if (!product) {
      return [];
    }
    return [
      { label: 'Product Code', type: 'mono', value: product.code },
      { label: 'Product Barcode', type: 'mono', value: product.barcode },
      { label: 'Created', type: 'datetime', value: product.createdAt },
      { label: 'Last Updated', type: 'datetime', value: product.updatedAt },
    ];
  });

  protected readonly variants = computed<VariantView[]>(() => {
    const product = this.product();
    const lookups = this.lookups();
    if (!product || !lookups) {
      return [];
    }
    const sizes = new Map(lookups.sizes.map((s) => [s.id, s]));
    const colors = new Map(lookups.colors.map((c) => [c.id, c]));
    return product.variants
      .map((variant) => {
        const size = sizes.get(variant.sizeId);
        const color = colors.get(variant.colorId);
        return {
          variant,
          size,
          view: {
            id: variant.id,
            designNo: variant.designNo,
            sizeName: size?.name ?? '—',
            colorName: color?.name ?? '—',
            hex: color?.hexCode ?? '',
            sku: variant.sku,
            barcode: variant.barcode,
            purchasePrice: variant.purchasePrice ?? product.purchasePrice,
            sellingPrice: variant.sellingPrice ?? product.sellingPrice,
            mrp: variant.mrp ?? product.mrp,
            overrides: {
              purchase: variant.purchasePrice !== null,
              selling: variant.sellingPrice !== null,
              mrp: variant.mrp !== null,
            },
          },
        };
      })
      .sort(
        (a, b) =>
          a.variant.designNo.localeCompare(b.variant.designNo, undefined, { numeric: true }) ||
          a.view.colorName.localeCompare(b.view.colorName) ||
          (a.size && b.size ? compareSizes(a.size, b.size) : 0),
      )
      .map((entry) => entry.view);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.id()): void {
    this.state.set('loading');
    forkJoin({
      product: this.productService.getById(id),
      lookups: this.lookupsService.load(),
    }).subscribe({
      next: ({ product, lookups }) => {
        this.product.set(product);
        this.lookups.set(lookups);
        this.state.set('ready');
        this.pageMeta.setTitle(product.name);
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.loadError.set(apiError.message);
        this.state.set(apiError.code === 'NOT_FOUND' ? 'not-found' : 'error');
      },
    });
  }

  protected async delete(): Promise<void> {
    const product = this.product();
    if (!product) {
      return;
    }
    await this.crud.delete({
      noun: 'product',
      name: product.name,
      status: product.status,
      remove: () => this.productService.remove(product.id),
      deactivate: () => this.productService.setStatus(product.id, 'inactive'),
      onDone: (outcome) =>
        outcome === 'deleted'
          ? void this.router.navigate(['/masters/products'])
          : this.load(product.id),
    });
  }

  protected async toggleStatus(): Promise<void> {
    const product = this.product();
    if (!product) {
      return;
    }
    await this.crud.toggleStatus({
      noun: 'product',
      name: product.name,
      status: product.status,
      setStatus: (status) => this.productService.setStatus(product.id, status),
      onDone: () => this.load(product.id),
    });
  }

  private nameOf(table: 'categories' | 'brands', id: string | undefined): string {
    if (!id) {
      return '';
    }
    return this.lookups()?.[table].find((item) => item.id === id)?.name ?? '—';
  }
}

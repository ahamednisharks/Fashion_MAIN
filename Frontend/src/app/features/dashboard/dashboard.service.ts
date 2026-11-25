import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';

import { BrandService } from '../../core/data-access/brand.service';
import { CategoryService } from '../../core/data-access/category.service';
import { ColorService } from '../../core/data-access/color.service';
import { CustomerService } from '../../core/data-access/customer.service';
import { ProductService } from '../../core/data-access/product.service';
import { SizeService } from '../../core/data-access/size.service';
import { SupplierService } from '../../core/data-access/supplier.service';
import { BaseEntity } from '../../core/models/base.model';
import { ProductListItem } from '../../core/models/product.model';

export interface MasterCount {
  readonly total: number;
  readonly active: number;
}

export interface ProductIssue {
  readonly product: ProductListItem;
  readonly issues: readonly string[];
}

export interface DashboardSummary {
  readonly products: MasterCount;
  readonly variants: number;
  readonly categories: MasterCount;
  readonly brands: MasterCount;
  readonly sizes: MasterCount;
  readonly colors: MasterCount;
  readonly suppliers: MasterCount;
  readonly customers: MasterCount;
  readonly recentProducts: readonly ProductListItem[];
  readonly needsAttention: readonly ProductIssue[];
}

function count(rows: readonly BaseEntity[]): MasterCount {
  return { total: rows.length, active: rows.filter((row) => row.status === 'active').length };
}

/** Aggregates master data for the dashboard. Replace with a single summary endpoint later. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly products = inject(ProductService);
  private readonly categories = inject(CategoryService);
  private readonly brands = inject(BrandService);
  private readonly sizes = inject(SizeService);
  private readonly colors = inject(ColorService);
  private readonly suppliers = inject(SupplierService);
  private readonly customers = inject(CustomerService);

  getSummary(): Observable<DashboardSummary> {
    return forkJoin({
      recent: this.products.list({
        search: '',
        status: '',
        filters: {},
        page: 1,
        pageSize: 5,
        sort: { field: 'updatedAt', direction: 'desc' },
      }),
      products: this.products.getAll(),
      categories: this.categories.getAll(),
      brands: this.brands.getAll(),
      sizes: this.sizes.getAll(),
      colors: this.colors.getAll(),
      suppliers: this.suppliers.getAll(),
      customers: this.customers.getAll(),
    }).pipe(
      map(({ recent, products, ...masters }) => ({
        products: count(products),
        variants: products.reduce((sum, p) => sum + p.variantCount, 0),
        categories: count(masters.categories),
        brands: count(masters.brands),
        sizes: count(masters.sizes),
        colors: count(masters.colors),
        suppliers: count(masters.suppliers),
        customers: count(masters.customers),
        recentProducts: recent.items,
        needsAttention: products
          .filter((p) => p.status === 'active')
          .map((product) => ({
            product,
            issues: [
              product.variantCount === 0 ? 'No variants' : '',
              product.hsnCode ? '' : 'No HSN code',
              product.purchasePrice === null ? 'No purchase price' : '',
            ].filter(Boolean),
          }))
          .filter((entry) => entry.issues.length > 0)
          .slice(0, 5),
      })),
    );
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { BrandService } from '../../../core/data-access/brand.service';
import { CategoryService } from '../../../core/data-access/category.service';
import { ProductService } from '../../../core/data-access/product.service';
import { ProductListItem } from '../../../core/models/product.model';
import { CellDef } from '../../../shared/components/data-table/cell-def.directive';
import { DataTable } from '../../../shared/components/data-table/data-table';
import {
  RowAction,
  RowActionEvent,
  TableColumn,
} from '../../../shared/components/data-table/table.types';
import { Icon } from '../../../shared/components/icon/icon';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { injectMasterPage } from '../../../shared/list/master-page';

@Component({
  selector: 'app-product-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, DataTable, CellDef, Pagination, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-list-page.html',
  host: { class: 'list-page' },
})
export class ProductListPage {
  private readonly router = inject(Router);

  protected readonly page = injectMasterPage<ProductListItem>({
    noun: 'product',
    service: inject(ProductService),
    filterKeys: ['categoryId', 'brandId'],
  });
  protected readonly list = this.page.list;

  // Filter options include inactive records so older products can still be found.
  protected readonly categories = toSignal(
    inject(CategoryService)
      .getAll()
      .pipe(catchError(() => of([]))),
    {
      initialValue: [],
    },
  );
  protected readonly brands = toSignal(
    inject(BrandService)
      .getAll()
      .pipe(catchError(() => of([]))),
    {
      initialValue: [],
    },
  );

  protected readonly actions: RowAction[] = ['view', 'edit', 'delete'];
  protected readonly columns: TableColumn<ProductListItem>[] = [
    { key: 'name', label: 'Product', value: (p) => p.name, sortable: true, mobile: 'title' },
    { key: 'categoryName', label: 'Category', value: (p) => p.categoryName, sortable: true },
    {
      key: 'brandName',
      label: 'Brand',
      value: (p) => p.brandName,
      sortable: true,
      hideBelow: 'lg',
    },
    {
      key: 'variantCount',
      label: 'Variants',
      type: 'number',
      value: (p) => p.variantCount,
      sortable: true,
      align: 'center',
      width: '100px',
    },
    {
      key: 'sellingPrice',
      label: 'Selling Price',
      type: 'currency',
      value: (p) => p.sellingPrice,
      sortable: true,
    },
    {
      key: 'mrp',
      label: 'MRP',
      type: 'currency',
      value: (p) => p.mrp,
      sortable: true,
      hideBelow: 'xl',
    },
    { key: 'status', label: 'Status', type: 'status', width: '110px' },
  ];

  protected onAction(event: RowActionEvent<ProductListItem>): void {
    switch (event.action) {
      case 'view':
        void this.router.navigate(['/masters/products', event.row.id]);
        break;
      case 'edit':
        void this.router.navigate(['/masters/products', event.row.id, 'edit']);
        break;
      default:
        this.page.onAction(event);
    }
  }

  protected create(): void {
    void this.router.navigate(['/masters/products/new']);
  }
}

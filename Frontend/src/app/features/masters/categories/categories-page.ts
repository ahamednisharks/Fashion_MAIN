import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CategoryService } from '../../../core/data-access/category.service';
import { Category } from '../../../core/models/category.model';
import { DataTable } from '../../../shared/components/data-table/data-table';
import { RowAction, TableColumn } from '../../../shared/components/data-table/table.types';
import { DetailItem, DetailList } from '../../../shared/components/detail-list/detail-list';
import { Icon } from '../../../shared/components/icon/icon';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { Modal } from '../../../shared/components/modal/modal';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { injectMasterPage } from '../../../shared/list/master-page';
import { CategoryForm } from './category-form';

@Component({
  selector: 'app-categories-page',
  imports: [PageHeader, ListToolbar, DataTable, Pagination, Modal, DetailList, Icon, CategoryForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories-page.html',
  host: { class: 'list-page' },
})
export class CategoriesPage {
  protected readonly page = injectMasterPage<Category>({
    noun: 'category',
    service: inject(CategoryService),
  });
  protected readonly list = this.page.list;

  protected readonly actions: RowAction[] = ['view', 'edit', 'delete'];
  protected readonly columns: TableColumn<Category>[] = [
    {
      key: 'name',
      label: 'Category Name',
      value: (c) => c.name,
      sortable: true,
      link: true,
      mobile: 'title',
    },
    { key: 'description', label: 'Description', value: (c) => c.description, mobile: 'full' },
    { key: 'status', label: 'Status', type: 'status', width: '120px' },
    {
      key: 'updatedAt',
      label: 'Last Updated',
      type: 'date',
      value: (c) => c.updatedAt,
      sortable: true,
      width: '150px',
      hideBelow: 'lg',
    },
  ];

  protected details(category: Category): DetailItem[] {
    return [
      { label: 'Category Name', value: category.name },
      { label: 'Status', type: 'status', value: category.status },
      { label: 'Description', type: 'multiline', value: category.description },
      { label: 'Created', type: 'datetime', value: category.createdAt },
      { label: 'Last Updated', type: 'datetime', value: category.updatedAt },
    ];
  }
}

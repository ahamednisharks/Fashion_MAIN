import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { BrandService } from '../../../core/data-access/brand.service';
import { Brand } from '../../../core/models/brand.model';
import { DataTable } from '../../../shared/components/data-table/data-table';
import { RowAction, TableColumn } from '../../../shared/components/data-table/table.types';
import { DetailItem, DetailList } from '../../../shared/components/detail-list/detail-list';
import { Icon } from '../../../shared/components/icon/icon';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { Modal } from '../../../shared/components/modal/modal';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { injectMasterPage } from '../../../shared/list/master-page';
import { BrandForm } from './brand-form';

@Component({
  selector: 'app-brands-page',
  imports: [PageHeader, ListToolbar, DataTable, Pagination, Modal, DetailList, Icon, BrandForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brands-page.html',
  host: { class: 'list-page' },
})
export class BrandsPage {
  protected readonly page = injectMasterPage<Brand>({
    noun: 'brand',
    service: inject(BrandService),
  });
  protected readonly list = this.page.list;

  protected readonly actions: RowAction[] = ['view', 'edit', 'delete'];
  protected readonly columns: TableColumn<Brand>[] = [
    {
      key: 'name',
      label: 'Brand Name',
      value: (b) => b.name,
      sortable: true,
      link: true,
      mobile: 'title',
    },
    { key: 'description', label: 'Description', value: (b) => b.description, mobile: 'full' },
    { key: 'status', label: 'Status', type: 'status', width: '120px' },
    {
      key: 'updatedAt',
      label: 'Last Updated',
      type: 'date',
      value: (b) => b.updatedAt,
      sortable: true,
      width: '150px',
      hideBelow: 'lg',
    },
  ];

  protected details(brand: Brand): DetailItem[] {
    return [
      { label: 'Brand Name', value: brand.name },
      { label: 'Status', type: 'status', value: brand.status },
      { label: 'Description', type: 'multiline', value: brand.description },
      { label: 'Created', type: 'datetime', value: brand.createdAt },
      { label: 'Last Updated', type: 'datetime', value: brand.updatedAt },
    ];
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SupplierService } from '../../../core/data-access/supplier.service';
import { Supplier } from '../../../core/models/supplier.model';
import { CellDef } from '../../../shared/components/data-table/cell-def.directive';
import { DataTable } from '../../../shared/components/data-table/data-table';
import { RowAction, TableColumn } from '../../../shared/components/data-table/table.types';
import { DetailItem, DetailList } from '../../../shared/components/detail-list/detail-list';
import { Icon } from '../../../shared/components/icon/icon';
import { ListToolbar } from '../../../shared/components/list-toolbar/list-toolbar';
import { Modal } from '../../../shared/components/modal/modal';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Pagination } from '../../../shared/components/pagination/pagination';
import { injectMasterPage } from '../../../shared/list/master-page';
import { SupplierForm } from './supplier-form';

@Component({
  selector: 'app-suppliers-page',
  imports: [
    PageHeader,
    ListToolbar,
    DataTable,
    CellDef,
    Pagination,
    Modal,
    DetailList,
    Icon,
    SupplierForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suppliers-page.html',
  host: { class: 'list-page' },
})
export class SuppliersPage {
  protected readonly page = injectMasterPage<Supplier>({
    noun: 'supplier',
    service: inject(SupplierService),
  });
  protected readonly list = this.page.list;

  protected readonly actions: RowAction[] = ['view', 'edit', 'toggle', 'delete'];
  protected readonly columns: TableColumn<Supplier>[] = [
    { key: 'name', label: 'Supplier', value: (s) => s.name, sortable: true, mobile: 'title' },
    { key: 'mobile', label: 'Mobile', value: (s) => s.mobile, width: '130px' },
    {
      key: 'city',
      label: 'City',
      value: (s) => [s.city, s.state].filter(Boolean).join(', '),
      sortable: true,
    },
    { key: 'gstNumber', label: 'GST Number', value: (s) => s.gstNumber, hideBelow: 'xl' },
    {
      key: 'openingBalance',
      label: 'Opening Bal.',
      type: 'currency',
      value: (s) => s.openingBalance,
      sortable: true,
      hideBelow: 'lg',
    },
    { key: 'status', label: 'Status', type: 'status', width: '110px' },
  ];

  protected details(supplier: Supplier): DetailItem[] {
    return [
      { label: 'Supplier Name', value: supplier.name },
      { label: 'Contact Person', value: supplier.contactPerson },
      { label: 'Mobile Number', value: supplier.mobile },
      { label: 'Email', value: supplier.email },
      { label: 'Address', type: 'multiline', value: supplier.address },
      { label: 'City', value: supplier.city },
      { label: 'State', value: supplier.state },
      { label: 'Pincode', value: supplier.pincode },
      { label: 'GST Number', type: 'mono', value: supplier.gstNumber },
      { label: 'Opening Balance', type: 'currency', value: supplier.openingBalance },
      { label: 'Status', type: 'status', value: supplier.status },
      { label: 'Last Updated', type: 'datetime', value: supplier.updatedAt },
    ];
  }
}

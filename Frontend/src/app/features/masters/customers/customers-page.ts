import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CustomerService } from '../../../core/data-access/customer.service';
import { Customer } from '../../../core/models/customer.model';
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
import { CustomerForm } from './customer-form';

@Component({
  selector: 'app-customers-page',
  imports: [
    PageHeader,
    ListToolbar,
    DataTable,
    CellDef,
    Pagination,
    Modal,
    DetailList,
    Icon,
    CustomerForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customers-page.html',
  host: { class: 'list-page' },
})
export class CustomersPage {
  protected readonly page = injectMasterPage<Customer>({
    noun: 'customer',
    service: inject(CustomerService),
  });
  protected readonly list = this.page.list;

  protected readonly actions: RowAction[] = ['view', 'edit', 'toggle', 'delete'];
  protected readonly columns: TableColumn<Customer>[] = [
    {
      key: 'name',
      label: 'Customer',
      value: (c) => c.name,
      sortable: true,
      link: true,
      mobile: 'title',
    },
    { key: 'mobile', label: 'Mobile', value: (c) => c.mobile, width: '130px' },
    { key: 'email', label: 'Email', value: (c) => c.email, hideBelow: 'xl' },
    { key: 'city', label: 'City', value: (c) => c.city, sortable: true },
    {
      key: 'gstNumber',
      label: 'GST Number',
      value: (c) => c.gstNumber,
      hideBelow: 'xl',
      mobile: 'hidden',
    },
    {
      key: 'openingBalance',
      label: 'Opening Bal.',
      type: 'currency',
      value: (c) => c.openingBalance,
      sortable: true,
      hideBelow: 'lg',
    },
    { key: 'status', label: 'Status', type: 'status', width: '110px' },
  ];

  protected details(customer: Customer): DetailItem[] {
    return [
      { label: 'Customer Name', value: customer.name },
      { label: 'Mobile Number', value: customer.mobile },
      { label: 'Email', value: customer.email },
      { label: 'GST Number', type: 'mono', value: customer.gstNumber },
      { label: 'Address', type: 'multiline', value: customer.address },
      { label: 'City', value: customer.city },
      { label: 'State', value: customer.state },
      { label: 'Pincode', value: customer.pincode },
      { label: 'Opening Balance', type: 'currency', value: customer.openingBalance },
      { label: 'Status', type: 'status', value: customer.status },
      { label: 'Customer Since', type: 'datetime', value: customer.createdAt },
      { label: 'Last Updated', type: 'datetime', value: customer.updatedAt },
    ];
  }
}

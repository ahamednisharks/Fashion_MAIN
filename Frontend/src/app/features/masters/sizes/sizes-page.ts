import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SizeService } from '../../../core/data-access/size.service';
import { SIZE_TYPE_OPTIONS, Size, SizeType, sizeTypeLabel } from '../../../core/models/size.model';
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
import { SizeForm } from './size-form';

const TYPE_BADGE: Record<SizeType, string> = {
  clothing: 'badge badge-primary',
  numeric: 'badge badge-info',
  custom: 'badge badge-warning',
};

@Component({
  selector: 'app-sizes-page',
  imports: [
    PageHeader,
    ListToolbar,
    DataTable,
    CellDef,
    Pagination,
    Modal,
    DetailList,
    Icon,
    SizeForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sizes-page.html',
  host: { class: 'list-page' },
})
export class SizesPage {
  protected readonly page = injectMasterPage<Size>({
    noun: 'size',
    service: inject(SizeService),
    filterKeys: ['type'],
  });
  protected readonly list = this.page.list;

  protected readonly typeOptions = SIZE_TYPE_OPTIONS;
  protected readonly typeBadge = TYPE_BADGE;
  protected readonly typeLabel = sizeTypeLabel;
  protected readonly actions: RowAction[] = ['view', 'edit', 'delete'];
  protected readonly columns: TableColumn<Size>[] = [
    {
      key: 'name',
      label: 'Size',
      value: (s) => s.name,
      link: true,
      mobile: 'title',
      width: '160px',
    },
    { key: 'type', label: 'Size Type', value: (s) => sizeTypeLabel(s.type), width: '140px' },
    { key: 'description', label: 'Description', value: (s) => s.description, mobile: 'full' },
    { key: 'status', label: 'Status', type: 'status', width: '120px' },
  ];

  protected details(size: Size): DetailItem[] {
    return [
      { label: 'Size Name', value: size.name },
      { label: 'Size Type', value: sizeTypeLabel(size.type) },
      { label: 'Status', type: 'status', value: size.status },
      { label: 'Description', type: 'multiline', value: size.description },
      { label: 'Created', type: 'datetime', value: size.createdAt },
      { label: 'Last Updated', type: 'datetime', value: size.updatedAt },
    ];
  }
}

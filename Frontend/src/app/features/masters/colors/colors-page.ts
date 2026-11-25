import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ColorService } from '../../../core/data-access/color.service';
import { Color } from '../../../core/models/color.model';
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
import { ColorForm } from './color-form';

@Component({
  selector: 'app-colors-page',
  imports: [
    PageHeader,
    ListToolbar,
    DataTable,
    CellDef,
    Pagination,
    Modal,
    DetailList,
    Icon,
    ColorForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './colors-page.html',
  host: { class: 'list-page' },
})
export class ColorsPage {
  protected readonly page = injectMasterPage<Color>({
    noun: 'colour',
    service: inject(ColorService),
  });
  protected readonly list = this.page.list;

  protected readonly actions: RowAction[] = ['view', 'edit', 'delete'];
  protected readonly columns: TableColumn<Color>[] = [
    { key: 'name', label: 'Color', value: (c) => c.name, sortable: true, mobile: 'title' },
    { key: 'hexCode', label: 'HEX Code', value: (c) => c.hexCode, sortable: true, width: '140px' },
    { key: 'description', label: 'Description', value: (c) => c.description, mobile: 'full' },
    { key: 'status', label: 'Status', type: 'status', width: '120px' },
  ];

  protected details(color: Color): DetailItem[] {
    return [
      { label: 'Color Name', value: color.name },
      { label: 'Color Code', type: 'color', value: color.hexCode },
      { label: 'Status', type: 'status', value: color.status },
      { label: 'Description', type: 'multiline', value: color.description },
      { label: 'Created', type: 'datetime', value: color.createdAt },
      { label: 'Last Updated', type: 'datetime', value: color.updatedAt },
    ];
  }
}

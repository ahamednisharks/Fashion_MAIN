import { inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';

import { ListQuery, PagedResult } from '../../core/data-access/api.types';
import { BaseEntity, EntityStatus } from '../../core/models/base.model';
import { CrudActionsService } from '../../core/services/crud-actions.service';
import { ToastService } from '../../core/services/toast.service';
import { capitalize } from '../../core/utils/text';
import { RowActionEvent } from '../components/data-table/table.types';
import { ListController, ListControllerOptions, injectListController } from './list-controller';

export type MasterDialog<T> =
  { readonly mode: 'create' } | { readonly mode: 'edit' | 'view'; readonly item: T };

/** The subset of a master data service that list screens use. */
export interface MasterListService<T> {
  list(query: ListQuery): Observable<PagedResult<T>>;
  remove(id: string): Observable<void>;
  setStatus(id: string, status: EntityStatus): Observable<unknown>;
}

export interface MasterPageConfig<T> extends ListControllerOptions {
  /** Lower-case singular noun, e.g. "category". */
  readonly noun: string;
  readonly service: MasterListService<T>;
}

type NamedEntity = BaseEntity & { readonly name: string };

/**
 * Behaviour shared by master list screens: list state, add/edit/view dialog state, row actions,
 * delete (with "deactivate instead") and status toggling. Supports `?action=new` deep links.
 */
export class MasterPage<T extends NamedEntity> {
  readonly list: ListController<T>;
  readonly dialog = signal<MasterDialog<T> | null>(null);

  private readonly crud = inject(CrudActionsService);
  private readonly toast = inject(ToastService);

  constructor(private readonly config: MasterPageConfig<T>) {
    this.list = injectListController((query) => config.service.list(query), config);

    const route = inject(ActivatedRoute);
    if (route.snapshot.queryParamMap.get('action') === 'new') {
      this.openCreate();
      void inject(Router).navigate([], {
        relativeTo: route,
        queryParams: { action: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  openCreate(): void {
    this.dialog.set({ mode: 'create' });
  }

  openView(item: T): void {
    this.dialog.set({ mode: 'view', item });
  }

  openEdit(item: T): void {
    this.dialog.set({ mode: 'edit', item });
  }

  close(): void {
    this.dialog.set(null);
  }

  onAction(event: RowActionEvent<T>): void {
    switch (event.action) {
      case 'view':
        this.openView(event.row);
        break;
      case 'edit':
        this.openEdit(event.row);
        break;
      case 'toggle':
        void this.toggleStatus(event.row);
        break;
      case 'delete':
        void this.delete(event.row);
        break;
    }
  }

  /** Call when the add/edit form saved successfully. */
  onSaved(saved: NamedEntity): void {
    const created = this.dialog()?.mode === 'create';
    this.toast.success(
      `${capitalize(this.config.noun)} "${saved.name}" ${created ? 'added' : 'updated'}.`,
    );
    this.close();
    this.list.reload();
  }

  async delete(item: T): Promise<void> {
    const { service, noun } = this.config;
    await this.crud.delete({
      noun,
      name: item.name,
      status: item.status,
      remove: () => service.remove(item.id),
      deactivate: () => service.setStatus(item.id, 'inactive'),
      onDone: () => {
        this.close();
        this.list.reload();
      },
    });
  }

  async toggleStatus(item: T): Promise<void> {
    const { service, noun } = this.config;
    await this.crud.toggleStatus({
      noun,
      name: item.name,
      status: item.status,
      setStatus: (status) => service.setStatus(item.id, status),
      onDone: () => {
        this.close();
        this.list.reload();
      },
    });
  }
}

/** Creates a MasterPage in the current injection context (component field initialiser). */
export function injectMasterPage<T extends NamedEntity>(
  config: MasterPageConfig<T>,
): MasterPage<T> {
  return new MasterPage(config);
}

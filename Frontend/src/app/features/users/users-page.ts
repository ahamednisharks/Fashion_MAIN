import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { toApiError } from '../../core/data-access/api.types';
import { UserService } from '../../core/data-access/user.service';
import {
  AppUser,
  ROLE_OPTIONS,
  UserWithTemporaryPassword,
  roleLabel,
} from '../../core/models/user.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { CrudActionsService } from '../../core/services/crud-actions.service';
import { ToastService } from '../../core/services/toast.service';
import { CellDef } from '../../shared/components/data-table/cell-def.directive';
import { DataTable } from '../../shared/components/data-table/data-table';
import {
  RowAction,
  RowActionEvent,
  TableColumn,
} from '../../shared/components/data-table/table.types';
import { DetailItem, DetailList } from '../../shared/components/detail-list/detail-list';
import { Icon } from '../../shared/components/icon/icon';
import { ListToolbar } from '../../shared/components/list-toolbar/list-toolbar';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Pagination } from '../../shared/components/pagination/pagination';
import { injectListController } from '../../shared/list/list-controller';
import { TemporaryPasswordDialog } from './temporary-password-dialog';
import { UserForm } from './user-form';

type UsersDialog =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit' | 'view'; readonly user: AppUser }
  | { readonly mode: 'password'; readonly title: string; readonly result: UserWithTemporaryPassword };

/**
 * Who can sign in (administrators only). The server protects against lock-outs: admins cannot
 * deactivate, delete or demote themselves, and the last active admin cannot be removed.
 */
@Component({
  selector: 'app-users-page',
  imports: [
    PageHeader,
    ListToolbar,
    DataTable,
    CellDef,
    Pagination,
    Modal,
    DetailList,
    Icon,
    UserForm,
    TemporaryPasswordDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-page.html',
  host: { class: 'list-page' },
})
export class UsersPage {
  private readonly service = inject(UserService);
  private readonly crud = inject(CrudActionsService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly currentUserId = inject(AuthService).user()?.id ?? null;
  protected readonly list = injectListController((query) => this.service.list(query), {
    filterKeys: ['role'],
  });
  protected readonly dialog = signal<UsersDialog | null>(null);
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleLabel = roleLabel;

  protected readonly actions: RowAction[] = ['view', 'edit', 'toggle', 'delete'];
  protected readonly columns: TableColumn<AppUser>[] = [
    {
      key: 'fullName',
      label: 'Name',
      value: (u) => u.fullName,
      sortable: true,
      link: true,
      mobile: 'title',
    },
    { key: 'username', label: 'Username', value: (u) => u.username, sortable: true },
    { key: 'role', label: 'Role', value: (u) => roleLabel(u.role), sortable: true, width: '150px' },
    { key: 'status', label: 'Status', type: 'status', width: '120px' },
    {
      key: 'lastLoginAt',
      label: 'Last Sign-in',
      type: 'date',
      value: (u) => u.lastLoginAt,
      sortable: true,
      width: '150px',
      hideBelow: 'lg',
    },
  ];

  protected isSelf(user: AppUser): boolean {
    return user.id === this.currentUserId;
  }

  protected openCreate(): void {
    this.dialog.set({ mode: 'create' });
  }

  protected openEdit(user: AppUser): void {
    this.dialog.set({ mode: 'edit', user });
  }

  protected close(): void {
    this.dialog.set(null);
  }

  protected onAction(event: RowActionEvent<AppUser>): void {
    switch (event.action) {
      case 'view':
        this.dialog.set({ mode: 'view', user: event.row });
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

  protected onCreated(result: UserWithTemporaryPassword): void {
    this.toast.success(`User "${result.user.fullName}" added.`);
    this.list.reload();
    this.dialog.set({ mode: 'password', title: 'User added', result });
  }

  protected onUpdated(user: AppUser): void {
    this.toast.success(`User "${user.fullName}" updated.`);
    this.close();
    this.list.reload();
  }

  protected async resetPassword(user: AppUser): Promise<void> {
    const confirmed = await this.confirm.confirm({
      tone: 'warning',
      title: 'Reset password?',
      message: `${user.fullName} will be signed out on every device and must sign in with a new temporary password.`,
      confirmLabel: 'Reset password',
    });
    if (!confirmed) {
      return;
    }
    try {
      const result = await firstValueFrom(this.service.resetPassword(user.id));
      this.list.reload();
      this.dialog.set({ mode: 'password', title: 'Password reset', result });
    } catch (error) {
      this.toast.error(toApiError(error).message);
    }
  }

  protected async delete(user: AppUser): Promise<void> {
    await this.crud.delete({
      noun: 'user',
      name: user.fullName,
      status: user.status,
      remove: () => this.service.remove(user.id),
      deactivate: () => this.service.setStatus(user.id, 'inactive'),
      onDone: () => {
        this.close();
        this.list.reload();
      },
    });
  }

  protected async toggleStatus(user: AppUser): Promise<void> {
    await this.crud.toggleStatus({
      noun: 'user',
      name: user.fullName,
      status: user.status,
      setStatus: (status) => this.service.setStatus(user.id, status),
      onDone: () => {
        this.close();
        this.list.reload();
      },
    });
  }

  protected details(user: AppUser): DetailItem[] {
    return [
      { label: 'Name', value: user.fullName },
      { label: 'Username', type: 'mono', value: user.username },
      { label: 'Role', value: roleLabel(user.role) },
      { label: 'Status', type: 'status', value: user.status },
      {
        label: 'Password',
        value: user.mustChangePassword ? 'Temporary — must be changed at next sign-in' : 'Set by user',
      },
      user.lastLoginAt
        ? { label: 'Last Sign-in', type: 'datetime', value: user.lastLoginAt }
        : { label: 'Last Sign-in', value: 'Never' },
      { label: 'Created', type: 'datetime', value: user.createdAt },
      { label: 'Last Updated', type: 'datetime', value: user.updatedAt },
    ];
  }
}

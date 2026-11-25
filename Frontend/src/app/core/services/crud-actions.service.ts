import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { toApiError } from '../data-access/api.types';
import { EntityStatus } from '../models/base.model';
import { capitalize } from '../utils/text';
import { ConfirmService } from './confirm.service';
import { ToastService } from './toast.service';

export interface DeleteFlow {
  /** Lower-case singular noun, e.g. "category". */
  readonly noun: string;
  readonly name: string;
  readonly status: EntityStatus;
  readonly remove: () => Observable<void>;
  /** When provided, users are offered "Deactivate instead" (and it's suggested if the record is in use). */
  readonly deactivate?: () => Observable<unknown>;
  /** Called after a successful delete or "deactivate instead". */
  readonly onDone: (outcome: 'deleted' | 'deactivated') => void;
}

export interface StatusFlow {
  readonly noun: string;
  readonly name: string;
  readonly status: EntityStatus;
  readonly setStatus: (status: EntityStatus) => Observable<unknown>;
  readonly onDone: () => void;
}

/** Shared confirm → call → notify flows used by every master list and details page. */
@Injectable({ providedIn: 'root' })
export class CrudActionsService {
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  /** Resolves true when the record was deleted. */
  async delete(flow: DeleteFlow): Promise<boolean> {
    const canDeactivate = !!flow.deactivate && flow.status === 'active';
    const choice = await this.confirmService.open({
      tone: 'danger',
      title: `Delete ${flow.noun}?`,
      message: `"${flow.name}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      alternateLabel: canDeactivate ? 'Deactivate instead' : undefined,
    });

    if (choice === 'alternate') {
      await this.deactivate(flow);
      return false;
    }
    if (choice !== 'confirm') {
      return false;
    }

    try {
      await firstValueFrom(flow.remove());
      this.toast.success(`${capitalize(flow.noun)} "${flow.name}" deleted.`);
      flow.onDone('deleted');
      return true;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'IN_USE' && canDeactivate) {
        const deactivate = await this.confirmService.confirm({
          tone: 'warning',
          title: `Can't delete this ${flow.noun}`,
          message: `${apiError.message} Deactivate it instead to hide it from new entries while keeping existing records intact.`,
          confirmLabel: 'Deactivate',
        });
        if (deactivate) {
          await this.deactivate(flow);
        }
      } else {
        this.toast.error(apiError.message);
      }
      return false;
    }
  }

  async toggleStatus(flow: StatusFlow): Promise<void> {
    const next: EntityStatus = flow.status === 'active' ? 'inactive' : 'active';
    try {
      await firstValueFrom(flow.setStatus(next));
      this.toast.success(
        `${capitalize(flow.noun)} "${flow.name}" ${next === 'active' ? 'activated' : 'deactivated'}.`,
      );
      flow.onDone();
    } catch (error) {
      this.toast.error(toApiError(error).message);
    }
  }

  private async deactivate(flow: DeleteFlow): Promise<void> {
    const deactivate = flow.deactivate;
    if (!deactivate) {
      return;
    }
    await this.toggleStatus({
      noun: flow.noun,
      name: flow.name,
      status: 'active',
      setStatus: () => deactivate(),
      onDone: () => flow.onDone('deactivated'),
    });
  }
}

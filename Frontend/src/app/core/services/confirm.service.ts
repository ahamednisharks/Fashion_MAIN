import { Injectable, signal } from '@angular/core';

export type ConfirmTone = 'danger' | 'warning' | 'primary';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional third choice, e.g. "Deactivate instead". */
  alternateLabel?: string;
  tone?: ConfirmTone;
}

export type ConfirmChoice = 'confirm' | 'alternate' | 'cancel';

export interface ActiveConfirm extends ConfirmOptions {
  readonly resolve: (choice: ConfirmChoice) => void;
}

/** Promise-based confirmation dialog rendered by <app-confirm-host>. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly active = signal<ActiveConfirm | null>(null);
  readonly current = this.active.asReadonly();

  open(options: ConfirmOptions): Promise<ConfirmChoice> {
    // Only one confirmation at a time — a new request cancels the previous one.
    this.active()?.resolve('cancel');
    return new Promise<ConfirmChoice>((resolve) => this.active.set({ ...options, resolve }));
  }

  async confirm(options: ConfirmOptions): Promise<boolean> {
    return (await this.open(options)) === 'confirm';
  }

  resolve(choice: ConfirmChoice): void {
    const current = this.active();
    if (current) {
      this.active.set(null);
      current.resolve(choice);
    }
  }
}

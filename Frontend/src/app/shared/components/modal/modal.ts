import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Icon } from '../icon/icon';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

/** Returns false to keep the modal open (e.g. user chose not to discard changes). */
export type ModalCloseGuard = () => boolean | Promise<boolean>;

let nextModalId = 0;

/**
 * Accessible modal built on the native <dialog> element (focus trapping, Escape, top layer).
 * The modal is open while it is rendered — show it with @if and remove it on (closed).
 *
 * Projected content should provide `.modal-body` and `.modal-footer` (directly or inside a
 * `.modal-form`), which keeps the header and footer fixed while the body scrolls.
 * Projected components can `inject(Modal)` to register a close guard or request closing.
 */
@Component({
  selector: 'app-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      [class]="'modal modal-' + size()"
      [attr.aria-labelledby]="titleId"
      (cancel)="onCancel($event)"
      (close)="onNativeClose()"
      (click)="onDialogClick($event)"
    >
      <div class="modal-header">
        <h2 class="modal-title" [id]="titleId">{{ title() }}</h2>
        <button
          type="button"
          class="btn btn-ghost btn-icon btn-sm"
          aria-label="Close dialog"
          (click)="requestClose()"
        >
          <app-icon name="x-lg" />
        </button>
      </div>
      <div class="modal-pane">
        <ng-content />
      </div>
    </dialog>
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly size = input<ModalSize>('md');
  /** Close when the backdrop is clicked. Off by default so forms don't lose input by accident. */
  readonly dismissible = input(false);
  readonly closed = output<void>();

  protected readonly titleId = `modal-title-${nextModalId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private closeGuard: ModalCloseGuard | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  setCloseGuard(guard: ModalCloseGuard | null): void {
    this.closeGuard = guard;
  }

  /** Runs the close guard (if any) and asks the owner to remove the modal. */
  async requestClose(): Promise<void> {
    if (this.closeGuard && !(await this.closeGuard())) {
      return;
    }
    if (!this.destroyed) {
      this.closed.emit();
    }
  }

  protected onCancel(event: Event): void {
    // Escape key: keep the dialog open and let the owner decide.
    event.preventDefault();
    void this.requestClose();
  }

  protected onNativeClose(): void {
    // The browser may force-close a dialog (e.g. repeated Escape). Keep the owner's state in sync.
    if (!this.destroyed) {
      this.closed.emit();
    }
  }

  protected onDialogClick(event: MouseEvent): void {
    if (this.dismissible() && event.target === this.dialog().nativeElement) {
      void this.requestClose();
    }
  }
}

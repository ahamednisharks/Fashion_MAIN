import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';

import { StatusFilter } from '../../../core/data-access/api.types';
import { Icon } from '../icon/icon';

/**
 * Search box + status filter + slot for extra filters (projected <select>s).
 * Search input is debounced; external changes (e.g. "Clear filters") are reflected back.
 */
@Component({
  selector: 'app-list-toolbar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './list-toolbar.scss',
  template: `
    <div class="toolbar-search" role="search">
      <app-icon name="search" class="search-icon" />
      <input
        #box
        type="search"
        class="form-control"
        enterkeyhint="search"
        autocomplete="off"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        [value]="term()"
        (input)="onInput(box.value)"
        (keydown.enter)="commit(box.value)"
      />
      @if (term()) {
        <button type="button" class="search-clear" aria-label="Clear search" (click)="commit('')">
          <app-icon name="x-circle-fill" />
        </button>
      }
    </div>
    <div class="toolbar-filters">
      <ng-content />
      @if (showStatus()) {
        <select
          #statusSelect
          class="form-control filter-select"
          aria-label="Filter by status"
          (change)="onStatus(statusSelect.value)"
        >
          <option value="" [selected]="status() === ''">All statuses</option>
          <option value="active" [selected]="status() === 'active'">Active</option>
          <option value="inactive" [selected]="status() === 'inactive'">Inactive</option>
        </select>
      }
      @if (hasFilters()) {
        <button type="button" class="btn btn-ghost btn-sm clear-btn" (click)="clear.emit()">
          <app-icon name="x-lg" /> Clear
        </button>
      }
    </div>
  `,
})
export class ListToolbar {
  readonly search = input('');
  readonly placeholder = input('Search');
  readonly status = input<StatusFilter>('');
  readonly showStatus = input(true);
  readonly hasFilters = input(false);

  readonly searchChange = output<string>();
  readonly statusChange = output<StatusFilter>();
  readonly clear = output<void>();

  protected readonly term = signal('');
  private lastEmitted = '';
  private readonly typed = new Subject<string>();

  constructor() {
    // Reflect external changes (URL navigation, "Clear") without clobbering what's being typed.
    effect(() => {
      const external = this.search();
      if (external !== this.lastEmitted) {
        this.lastEmitted = external;
        this.term.set(external);
      }
    });

    this.typed
      .pipe(debounceTime(300), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((value) => this.emit(value));
  }

  protected onInput(value: string): void {
    this.term.set(value);
    this.typed.next(value);
  }

  protected commit(value: string): void {
    this.term.set(value);
    this.emit(value);
  }

  protected onStatus(value: string): void {
    this.statusChange.emit(value === 'active' || value === 'inactive' ? value : '');
  }

  private emit(value: string): void {
    const trimmed = value.trim();
    if (trimmed !== this.lastEmitted) {
      this.lastEmitted = trimmed;
      this.searchChange.emit(trimmed);
    }
  }
}

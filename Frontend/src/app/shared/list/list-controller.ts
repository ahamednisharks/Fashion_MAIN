import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Params, Router } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import {
  ListQuery,
  PagedResult,
  SortState,
  StatusFilter,
  toApiError,
} from '../../core/data-access/api.types';
import { PAGE_SIZE_OPTIONS } from '../components/pagination/pagination';

export interface ListControllerOptions {
  /** Extra exact-match filters that are kept in the URL, e.g. ['categoryId', 'brandId']. */
  readonly filterKeys?: readonly string[];
  readonly defaultPageSize?: number;
}

type LoadResult<T> = { ok: true; result: PagedResult<T> } | { ok: false; message: string };

/**
 * State + loading logic shared by every list screen.
 *
 * The URL query string is the single source of truth (search, status, filters, page, page size,
 * sort). That keeps filters across "view details → back", supports browser history and makes
 * lists shareable. Create with `injectListController()` inside a component.
 */
export class ListController<T> {
  private readonly queryState = signal<ListQuery>({
    search: '',
    status: '',
    filters: {},
    page: 1,
    pageSize: PAGE_SIZE_OPTIONS[0],
    sort: null,
  });
  private readonly reload$ = new Subject<void>();

  readonly query: Signal<ListQuery> = this.queryState.asReadonly();
  readonly items = signal<readonly T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly hasFilters = computed(() => {
    const query = this.query();
    return !!query.search || !!query.status || Object.values(query.filters).some(Boolean);
  });

  private readonly filterKeys: readonly string[];
  private readonly defaultPageSize: number;

  constructor(
    load: (query: ListQuery) => Observable<PagedResult<T>>,
    options: ListControllerOptions,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    destroyRef: DestroyRef,
  ) {
    this.filterKeys = options.filterKeys ?? [];
    this.defaultPageSize = options.defaultPageSize ?? PAGE_SIZE_OPTIONS[0];

    const query$ = this.route.queryParamMap.pipe(
      map((params) => this.parse(params)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );

    combineLatest([query$, this.reload$.pipe(startWith(undefined))])
      .pipe(
        tap(([query]) => {
          this.queryState.set(query);
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(([query]) =>
          load(query).pipe(
            map((result): LoadResult<T> => ({ ok: true, result })),
            catchError((error: unknown) =>
              of<LoadResult<T>>({ ok: false, message: toApiError(error).message }),
            ),
          ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((outcome) => {
        this.loading.set(false);
        if (!outcome.ok) {
          this.error.set(outcome.message);
          return;
        }
        const { items, total, page, pageSize } = outcome.result;
        // The current page can become empty after deletions — step back to the last page.
        if (items.length === 0 && total > 0 && page > 1) {
          this.setPage(Math.ceil(total / pageSize));
          return;
        }
        this.items.set(items);
        this.total.set(total);
      });
  }

  reload(): void {
    this.reload$.next();
  }

  setSearch(search: string): void {
    this.navigate({ ...this.query(), search, page: 1 });
  }

  setStatus(status: StatusFilter): void {
    this.navigate({ ...this.query(), status, page: 1 });
  }

  setFilter(key: string, value: string): void {
    this.setFilters({ [key]: value });
  }

  /** Changes several filters in one step (e.g. both ends of a period). */
  setFilters(values: Readonly<Record<string, string>>): void {
    this.navigate({ ...this.query(), filters: { ...this.query().filters, ...values }, page: 1 });
  }

  setPage(page: number): void {
    this.navigate({ ...this.query(), page });
  }

  setPageSize(pageSize: number): void {
    this.navigate({ ...this.query(), pageSize, page: 1 });
  }

  setSort(sort: SortState | null): void {
    this.navigate({ ...this.query(), sort, page: 1 });
  }

  /** Clears search, status and filters — except the filter keys listed in `keep`. */
  clearFilters(keep: readonly string[] = []): void {
    const current = this.query().filters;
    const filters = Object.fromEntries(keep.map((key) => [key, current[key] ?? '']));
    this.navigate({ ...this.query(), search: '', status: '', filters, page: 1 });
  }

  filterValue(key: string): string {
    return this.query().filters[key] ?? '';
  }

  private parse(params: ParamMap): ListQuery {
    const status = params.get('status');
    const page = Number(params.get('page'));
    const size = Number(params.get('size'));
    const sortField = params.get('sort');
    const filters: Record<string, string> = {};
    for (const key of this.filterKeys) {
      filters[key] = params.get(key) ?? '';
    }
    return {
      search: params.get('q')?.trim() ?? '',
      status: status === 'active' || status === 'inactive' ? status : '',
      filters,
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize: PAGE_SIZE_OPTIONS.includes(size) ? size : this.defaultPageSize,
      sort: sortField
        ? { field: sortField, direction: params.get('dir') === 'desc' ? 'desc' : 'asc' }
        : null,
    };
  }

  private navigate(query: ListQuery): void {
    const queryParams: Params = {
      q: query.search || null,
      status: query.status || null,
      page: query.page > 1 ? query.page : null,
      size: query.pageSize !== this.defaultPageSize ? query.pageSize : null,
      sort: query.sort?.field ?? null,
      dir: query.sort?.direction ?? null,
    };
    for (const key of this.filterKeys) {
      queryParams[key] = query.filters[key] || null;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }
}

export function injectListController<T>(
  load: (query: ListQuery) => Observable<PagedResult<T>>,
  options: ListControllerOptions = {},
): ListController<T> {
  return new ListController(
    load,
    options,
    inject(Router),
    inject(ActivatedRoute),
    inject(DestroyRef),
  );
}

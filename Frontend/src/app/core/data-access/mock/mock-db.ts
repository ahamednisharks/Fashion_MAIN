import { Injectable, signal } from '@angular/core';
import { Observable, map, timer } from 'rxjs';

import { BaseEntity } from '../../models/base.model';
import { readJson, removeKeys, writeJson } from '../../utils/storage';
import { ApiError } from '../api.types';
import { EntityOf, ResourceName } from '../data-source';
import { MOCK_SEED } from './mock-seed';

const DATA_PREFIX = 'mock.v1.data.';
const SIMULATE_ERRORS_KEY = 'mock.v1.simulateErrors';

/**
 * In-browser stand-in for the backend database.
 *
 * - Tables are persisted to localStorage so data survives reloads during frontend testing.
 * - Every request goes through `request()`, which adds latency (so loading states are exercised)
 *   and can simulate network failures (so error states can be tested from Settings).
 * - Results are deep-cloned so the UI can never mutate stored records by reference.
 */
@Injectable({ providedIn: 'root' })
export class MockDb {
  readonly latencyMs = 300;

  private readonly simulateErrorsState = signal(readJson<boolean>(SIMULATE_ERRORS_KEY, false));
  readonly simulateErrors = this.simulateErrorsState.asReadonly();

  private readonly cache = new Map<ResourceName, BaseEntity[]>();
  private storageWarningShown = false;

  table<K extends ResourceName>(name: K): EntityOf<K>[] {
    let rows = this.cache.get(name);
    if (!rows) {
      rows = readJson<BaseEntity[] | null>(DATA_PREFIX + name, null) ?? this.seed(name);
      this.cache.set(name, rows);
    }
    // Rows are only ever stored under their own resource name, so this narrowing is safe.
    return rows as EntityOf<K>[];
  }

  save<K extends ResourceName>(name: K, rows: EntityOf<K>[]): void {
    this.cache.set(name, rows);
    if (!writeJson(DATA_PREFIX + name, rows) && !this.storageWarningShown) {
      // Keep working in memory; data simply won't survive a reload.
      this.storageWarningShown = true;
      console.warn(
        '[MockDb] localStorage unavailable — mock data will not persist across reloads.',
      );
    }
  }

  /** Simulates an HTTP round trip around a synchronous unit of work. */
  request<R>(work: () => R): Observable<R> {
    return timer(this.latencyMs).pipe(
      map(() => {
        if (this.simulateErrorsState()) {
          throw new ApiError(
            'NETWORK',
            'Unable to reach the server. Check your connection and try again.',
          );
        }
        return structuredClone(work());
      }),
    );
  }

  setSimulateErrors(enabled: boolean): void {
    this.simulateErrorsState.set(enabled);
    writeJson(SIMULATE_ERRORS_KEY, enabled);
  }

  /** Discards all stored mock data; tables are re-seeded on next access. */
  resetToSeed(): void {
    removeKeys((key) => key.startsWith(DATA_PREFIX));
    this.cache.clear();
  }

  private seed(name: ResourceName): BaseEntity[] {
    const rows: BaseEntity[] = structuredClone(MOCK_SEED[name]);
    writeJson(DATA_PREFIX + name, rows);
    return rows;
  }
}

/** A report period in the shop's local calendar; both days are included. */
export interface DateRange {
  /** YYYY-MM-DD */
  readonly from: string;
  /** YYYY-MM-DD */
  readonly to: string;
}

export type RangePreset = 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'thisYear';

export const RANGE_PRESETS: readonly { readonly value: RangePreset; readonly label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisYear', label: 'This FY' },
];

/** Longest period one report may cover — same limit as the server. */
export const MAX_REPORT_DAYS = 366;

const DAY_MS = 86_400_000;

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The period a preset stands for, as of `today`. "This month" and "This FY" end today;
 * the financial year runs April–March.
 */
export function presetRange(preset: RangePreset, today = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (preset) {
    case 'today':
      return { from: isoDate(today), to: isoDate(today) };
    case 'yesterday': {
      const yesterday = isoDate(new Date(y, m, d - 1));
      return { from: yesterday, to: yesterday };
    }
    case 'thisMonth':
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(today) };
    case 'lastMonth':
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case 'thisYear':
      return { from: isoDate(new Date(m >= 3 ? y : y - 1, 3, 1)), to: isoDate(today) };
  }
}

/** The preset that produces exactly this range today, if any. */
export function matchingPreset(range: DateRange, today = new Date()): RangePreset | null {
  const match = RANGE_PRESETS.find(({ value }) => {
    const preset = presetRange(value, today);
    return preset.from === range.from && preset.to === range.to;
  });
  return match?.value ?? null;
}

/** Days from `from` to `to`, both included (0 or less when `to` is before `from`). */
export function daysInRange(range: DateRange): number {
  return (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS + 1;
}

/** Why a typed period cannot be used, or null when it is fine. */
export function rangeError(range: { from: string; to: string }): string | null {
  if (!range.from || !range.to) {
    return 'Choose both From and To dates.';
  }
  const days = daysInRange(range);
  if (Number.isNaN(days)) {
    return 'Enter valid dates.';
  }
  if (days < 1) {
    return 'To date cannot be before From date.';
  }
  if (days > MAX_REPORT_DAYS) {
    return `A report can cover at most ${MAX_REPORT_DAYS} days. Choose a shorter period.`;
  }
  return null;
}

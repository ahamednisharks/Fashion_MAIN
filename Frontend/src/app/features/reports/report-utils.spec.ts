import { toCsv } from './csv';
import { daysInRange, isoDate, matchingPreset, presetRange, rangeError } from './date-range';

describe('report date ranges', () => {
  // Months are 0-based in Date: this is 24 Nov 2026.
  const today = new Date(2026, 10, 24, 15, 30);

  it('formats local dates', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('builds the preset periods', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-11-24', to: '2026-11-24' });
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-11-23', to: '2026-11-23' });
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-11-01', to: '2026-11-24' });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('thisYear', today)).toEqual({ from: '2026-04-01', to: '2026-11-24' });
  });

  it('handles month and year edges', () => {
    const newYear = new Date(2027, 0, 1);
    expect(presetRange('yesterday', newYear)).toEqual({ from: '2026-12-31', to: '2026-12-31' });
    expect(presetRange('lastMonth', newYear)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    // January–March belong to the financial year that started the previous April.
    expect(presetRange('thisYear', new Date(2027, 2, 31))).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    });
    expect(presetRange('thisYear', new Date(2027, 3, 1)).from).toBe('2027-04-01');
    expect(presetRange('lastMonth', new Date(2028, 2, 10))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('recognises a preset period', () => {
    expect(matchingPreset({ from: '2026-11-01', to: '2026-11-24' }, today)).toBe('thisMonth');
    expect(matchingPreset({ from: '2026-11-02', to: '2026-11-24' }, today)).toBeNull();
  });

  it('counts days with both ends included and validates periods', () => {
    expect(daysInRange({ from: '2026-11-01', to: '2026-11-01' })).toBe(1);
    expect(daysInRange({ from: '2024-01-01', to: '2024-12-31' })).toBe(366);
    expect(rangeError({ from: '2026-11-01', to: '2026-11-24' })).toBeNull();
    expect(rangeError({ from: '', to: '2026-11-24' })).toMatch(/both/);
    expect(rangeError({ from: '2026-11-24', to: '2026-11-01' })).toMatch(/before/);
    expect(rangeError({ from: '2025-01-01', to: '2026-01-02' })).toMatch(/366 days/);
  });
});

describe('CSV', () => {
  it('quotes text that needs it and keeps numbers as they are', () => {
    expect(
      toCsv([
        ['Date', 'Net sales'],
        ['2026-11-24', 1234.5],
        ['a,b', -0.1],
      ]),
    ).toBe('Date,Net sales\r\n2026-11-24,1234.5\r\n"a,b",-0.1\r\n');
    expect(toCsv([['say "hi"', 'line\nbreak']])).toBe('"say ""hi""","line\nbreak"\r\n');
  });

  it('neutralises text that a spreadsheet would run as a formula', () => {
    expect(toCsv([['=SUM(A1)', '+91', '@x', 'plain']])).toBe("'=SUM(A1),'+91,'@x,plain\r\n");
  });
});

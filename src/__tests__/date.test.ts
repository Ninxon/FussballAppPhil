import { fmtDateShort, fmtTimestampShort, fmtTime, monthCells } from '../utils/date';

describe('fmtDateShort', () => {
  it('formats YYYY-MM-DD as DD.MM.YYYY', () => {
    expect(fmtDateShort('2026-08-03')).toBe('03.08.2026');
  });

  it('keeps leading zeros', () => {
    expect(fmtDateShort('2026-01-05')).toBe('05.01.2026');
  });
});

describe('fmtTimestampShort', () => {
  it('formats an ISO timestamp as DD.MM.YYYY', () => {
    // Mittagszeit, damit keine Zeitzonen-Grenze den Tag verschiebt.
    expect(fmtTimestampShort('2026-08-03T12:00:00Z')).toMatch(/^03\.08\.2026$/);
  });
});

describe('fmtTime', () => {
  it('normalizes HH:MM:SS to HH:MM', () => {
    expect(fmtTime({ time: '14:30:00' }).time).toBe('14:30');
  });

  it('leaves HH:MM unchanged', () => {
    expect(fmtTime({ time: '14:30' }).time).toBe('14:30');
  });

  it('passes null/undefined through', () => {
    expect(fmtTime({ time: null }).time).toBeNull();
    expect(fmtTime({} as { time?: string }).time).toBeUndefined();
  });

  it('does not mutate the input object', () => {
    const row = { time: '09:15:00', other: 1 };
    const result = fmtTime(row);
    expect(row.time).toBe('09:15:00');
    expect(result.other).toBe(1);
  });
});

describe('monthCells', () => {
  it('starts Monday-first: June 2026 begins on a Monday (no leading nulls)', () => {
    const cells = monthCells(2026, 5); // Juni 2026, 1.6. = Montag
    expect(cells[0]).toBe(1);
    expect(cells).toHaveLength(30);
  });

  it('pads leading nulls: August 2026 starts on a Saturday (5 nulls)', () => {
    const cells = monthCells(2026, 7); // 1.8.2026 = Samstag
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(cells[5]).toBe(1);
    expect(cells.filter(c => c !== null)).toHaveLength(31);
  });

  it('handles leap February', () => {
    const cells = monthCells(2024, 1); // Februar 2024, 29 Tage, 1.2. = Donnerstag
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells.filter(c => c !== null)).toHaveLength(29);
    expect(cells[cells.length - 1]).toBe(29);
  });

  it('handles non-leap February', () => {
    const cells = monthCells(2026, 1);
    expect(cells.filter(c => c !== null)).toHaveLength(28);
  });
});

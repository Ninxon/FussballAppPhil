import { fmtDateShort, fmtTimestampShort, fmtTime } from '../utils/date';

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

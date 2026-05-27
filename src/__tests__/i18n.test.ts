import { todayStr, fmtDate, fmtShort, DE_MONTHS, DE_MONTHS_S, DE_DAYS_FULL } from '../constants/i18n';

describe('todayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has length 10', () => {
    expect(todayStr()).toHaveLength(10);
  });

  it('matches current local date (midnight-safe)', () => {
    // todayStr() nutzt lokale Datumskomponenten — expected ebenso berechnen,
    // nicht via toISOString() (UTC), sonst bricht der Test um Mitternacht,
    // wenn lokale Zeitzone und UTC auf unterschiedlichen Tagen liegen.
    const now = new Date();
    const expected =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayStr()).toBe(expected);
  });
});

describe('fmtDate', () => {
  // Known date: 2024-01-01 is a Monday
  it('formats Monday correctly', () => {
    expect(fmtDate('2024-01-01')).toBe('Montag, 1. Januar 2024');
  });

  it('formats Tuesday correctly', () => {
    // 2024-01-02 is Tuesday
    expect(fmtDate('2024-01-02')).toBe('Dienstag, 2. Januar 2024');
  });

  it('formats Wednesday correctly', () => {
    expect(fmtDate('2024-01-03')).toBe('Mittwoch, 3. Januar 2024');
  });

  it('formats Thursday correctly', () => {
    expect(fmtDate('2024-01-04')).toBe('Donnerstag, 4. Januar 2024');
  });

  it('formats Friday correctly', () => {
    expect(fmtDate('2024-01-05')).toBe('Freitag, 5. Januar 2024');
  });

  it('formats Saturday correctly', () => {
    expect(fmtDate('2024-01-06')).toBe('Samstag, 6. Januar 2024');
  });

  it('formats Sunday correctly', () => {
    expect(fmtDate('2024-01-07')).toBe('Sonntag, 7. Januar 2024');
  });

  it.each([
    ['2024-01-15', 'Januar'],
    ['2024-02-15', 'Februar'],
    ['2024-03-15', 'März'],
    ['2024-04-15', 'April'],
    ['2024-05-15', 'Mai'],
    ['2024-06-15', 'Juni'],
    ['2024-07-15', 'Juli'],
    ['2024-08-15', 'August'],
    ['2024-09-15', 'September'],
    ['2024-10-15', 'Oktober'],
    ['2024-11-15', 'November'],
    ['2024-12-15', 'Dezember'],
  ])('month name for %s is %s', (date, monthName) => {
    expect(fmtDate(date)).toContain(monthName);
  });

  it('includes year at end', () => {
    expect(fmtDate('2025-06-15')).toContain('2025');
  });

  it('no leading zero in day', () => {
    const result = fmtDate('2024-03-05');
    expect(result).toContain('5. März');
    expect(result).not.toContain('05. März');
  });
});

describe('fmtShort', () => {
  it('formats day and short month without leading zero', () => {
    expect(fmtShort('2024-03-05')).toBe('5. Mär');
  });

  it('formats double-digit day correctly', () => {
    expect(fmtShort('2024-11-23')).toBe('23. Nov');
  });

  it.each([
    ['2024-01-01', 'Jan'],
    ['2024-02-01', 'Feb'],
    ['2024-03-01', 'Mär'],
    ['2024-04-01', 'Apr'],
    ['2024-05-01', 'Mai'],
    ['2024-06-01', 'Jun'],
    ['2024-07-01', 'Jul'],
    ['2024-08-01', 'Aug'],
    ['2024-09-01', 'Sep'],
    ['2024-10-01', 'Okt'],
    ['2024-11-01', 'Nov'],
    ['2024-12-01', 'Dez'],
  ])('short month for %s is %s', (date, shortName) => {
    expect(fmtShort(date)).toContain(shortName);
  });

  it('does not include year', () => {
    expect(fmtShort('2024-06-15')).not.toContain('2024');
  });
});

describe('DE_MONTHS / DE_MONTHS_S constants', () => {
  it('DE_MONTHS has 12 entries', () => {
    expect(DE_MONTHS).toHaveLength(12);
  });

  it('DE_MONTHS_S has 12 entries', () => {
    expect(DE_MONTHS_S).toHaveLength(12);
  });

  it('DE_DAYS_FULL starts with Montag', () => {
    expect(DE_DAYS_FULL[0]).toBe('Montag');
  });

  it('DE_DAYS_FULL ends with Sonntag', () => {
    expect(DE_DAYS_FULL[6]).toBe('Sonntag');
  });
});

import {
  checkDailyConflict,
  isSlotInPast,
  easterDate,
  germanHolidays,
  isBookableDay,
  isBlockedByPeriod,
} from '../utils/bookingRules';

// ── Tages-Konflikt ───────────────────────────────────────────────────────────

describe('checkDailyConflict', () => {
  const confirmed = (program: string) => ({
    date: '2026-05-04',
    time: '09:00',
    status: 'confirmed',
    program,
  });

  test('erlaubt Buchung wenn kein Termin am Tag', () => {
    expect(checkDailyConflict([], '2026-05-04')).toEqual({ allowed: true });
  });

  test('erlaubt zweiten Termin am gleichen Tag (max 2 pro Tag)', () => {
    const result = checkDailyConflict([confirmed('individual')], '2026-05-04');
    expect(result.allowed).toBe(true);
  });

  test('blockiert dritten Termin am gleichen Tag', () => {
    const two = [confirmed('individual'), { ...confirmed('gruppe'), time: '11:00' }];
    const result = checkDailyConflict(two, '2026-05-04');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  test('ignoriert stornierte Termine beim Konfliktcheck', () => {
    const cancelled = { ...confirmed('individual'), status: 'cancelled' };
    expect(checkDailyConflict([cancelled], '2026-05-04')).toEqual({ allowed: true });
  });

  test('erlaubt Buchung an anderem Datum', () => {
    const result = checkDailyConflict([confirmed('individual')], '2026-05-05');
    expect(result.allowed).toBe(true);
  });
});

// ── Vergangene Zeitslots ─────────────────────────────────────────────────────

describe('isSlotInPast', () => {
  test('anderer Tag → nie vergangen', () => {
    expect(isSlotInPast('08:30', '2026-04-23', '2026-04-24')).toBe(false);
  });

  test('heutiger Tag, vergangener Slot → true', () => {
    const mockDate = new Date('2026-04-23T12:00:00');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
    expect(isSlotInPast('08:30', '2026-04-23', '2026-04-23')).toBe(true);
    jest.restoreAllMocks();
  });

  test('heutiger Tag, zukünftiger Slot → false', () => {
    const mockDate = new Date('2026-04-23T08:00:00');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
    expect(isSlotInPast('09:00', '2026-04-23', '2026-04-23')).toBe(false);
    jest.restoreAllMocks();
  });
});

// ── Osterdatum ───────────────────────────────────────────────────────────────

describe('easterDate', () => {
  const cases: [number, string][] = [
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2030, '2030-04-21'],
  ];

  test.each(cases)('Ostern %i ist %s', (year, expected) => {
    const d = easterDate(year);
    const result = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});

// ── Deutsche Feiertage ───────────────────────────────────────────────────────

describe('germanHolidays', () => {
  test('enthält Neujahr, Tag der Deutschen Einheit, Weihnachten', () => {
    const h = germanHolidays(2026);
    expect(h.has('2026-01-01')).toBe(true);
    expect(h.has('2026-10-03')).toBe(true);
    expect(h.has('2026-12-25')).toBe(true);
    expect(h.has('2026-12-26')).toBe(true);
  });

  test('enthält Karfreitag und Ostermontag 2026', () => {
    const h = germanHolidays(2026);
    expect(h.has('2026-04-03')).toBe(true);
    expect(h.has('2026-04-06')).toBe(true);
  });

  test('enthält Pfingstmontag 2026', () => {
    expect(germanHolidays(2026).has('2026-05-25')).toBe(true);
  });

  test('enthält Tag der Arbeit', () => {
    expect(germanHolidays(2026).has('2026-05-01')).toBe(true);
  });

  test('enthält Fronleichnam (Hessen) 2026', () => {
    expect(germanHolidays(2026).has('2026-06-04')).toBe(true);
  });

  test('enthält genau 10 Feiertage (inkl. Fronleichnam)', () => {
    expect(germanHolidays(2026).size).toBe(10);
  });

  test('cached: gleiche Set-Instanz pro Jahr (Kalender ruft pro Zelle auf)', () => {
    expect(germanHolidays(2027)).toBe(germanHolidays(2027));
    expect(germanHolidays(2027)).not.toBe(germanHolidays(2028));
  });
});

// ── Buchbarer Tag ────────────────────────────────────────────────────────────

describe('isBookableDay', () => {
  test('normaler Werktag ist buchbar', () => {
    expect(isBookableDay('2026-05-04')).toBe(true);
  });

  test('Samstag ist nicht buchbar', () => {
    expect(isBookableDay('2026-05-02')).toBe(false);
  });

  test('Sonntag ist nicht buchbar', () => {
    expect(isBookableDay('2026-05-03')).toBe(false);
  });

  test('Feiertag ist nicht buchbar', () => {
    expect(isBookableDay('2026-01-01')).toBe(false);
    expect(isBookableDay('2026-12-25')).toBe(false);
    expect(isBookableDay('2026-04-06')).toBe(false);
  });

  test('Tag in gesperrtem Zeitraum (Schulferien) ist nicht buchbar', () => {
    const periods = [{ start_date: '2026-06-29', end_date: '2026-08-07' }];
    // 2026-07-15 ist ein Mittwoch in den Sommerferien
    expect(isBookableDay('2026-07-15', periods)).toBe(false);
    // ein Werktag außerhalb der Ferien bleibt buchbar
    expect(isBookableDay('2026-05-04', periods)).toBe(true);
  });
});

// ── Gesperrte Zeiträume ──────────────────────────────────────────────────────

describe('isBlockedByPeriod', () => {
  const periods = [
    { start_date: '2026-06-29', end_date: '2026-08-07' },
    { start_date: '2026-12-23', end_date: '2027-01-12' },
  ];

  test('Datum innerhalb eines Zeitraums (inkl. Grenzen)', () => {
    expect(isBlockedByPeriod('2026-06-29', periods)).toBe(true);
    expect(isBlockedByPeriod('2026-08-07', periods)).toBe(true);
    expect(isBlockedByPeriod('2026-07-15', periods)).toBe(true);
  });

  test('jahresübergreifender Zeitraum', () => {
    expect(isBlockedByPeriod('2027-01-05', periods)).toBe(true);
  });

  test('Datum außerhalb aller Zeiträume', () => {
    expect(isBlockedByPeriod('2026-08-08', periods)).toBe(false);
    expect(isBlockedByPeriod('2026-06-28', periods)).toBe(false);
  });

  test('leere Liste blockiert nichts', () => {
    expect(isBlockedByPeriod('2026-07-15', [])).toBe(false);
  });
});

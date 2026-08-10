import {
  checkProgramPermission,
  isWithinCancellationDeadline,
  checkGroupSessionCompatibility,
  canJoinGroupSlot,
  reconstructGroups,
} from '../utils/bookingRules';
import { BookingPermissions, PlayerLevel } from '../types';
import { ProgramId } from '../constants/programs';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

const allPerms = (): BookingPermissions => ({
  can_book_individual: true,
  can_book_gruppe: true,
  can_book_athletik: true,
  can_book_torhueter_individual: true,
  can_book_torhueter_gruppe: true,
});

const noPerms = (): BookingPermissions => ({
  can_book_individual: false,
  can_book_gruppe: false,
  can_book_athletik: false,
  can_book_torhueter_individual: false,
  can_book_torhueter_gruppe: false,
});

const player = (birthYear: number, level: PlayerLevel) => ({ birthYear, level });

// ── checkProgramPermission ───────────────────────────────────────────────────

describe('checkProgramPermission', () => {
  const programs: ProgramId[] = [
    'individual', 'gruppe', 'athletik', 'torhueter_individual', 'torhueter_gruppe',
  ];

  test.each(programs)(
    'erlaubt "%s" wenn das zugehörige Flag gesetzt ist',
    (id) => {
      expect(checkProgramPermission(allPerms(), id)).toEqual({ allowed: true });
    },
  );

  test.each(programs)(
    'blockiert "%s" wenn das zugehörige Flag fehlt',
    (id) => {
      const result = checkProgramPermission(noPerms(), id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    },
  );

  test('blockiert wenn nur ein Flag false ist', () => {
    const perms = allPerms();
    perms.can_book_gruppe = false;
    expect(checkProgramPermission(perms, 'gruppe').allowed).toBe(false);
    expect(checkProgramPermission(perms, 'individual').allowed).toBe(true);
  });

  test('blockiert unbekannte programId', () => {
    const result = checkProgramPermission(allPerms(), 'unbekannt' as ProgramId);
    expect(result.allowed).toBe(false);
  });

  test('alle Flags false → blockiert alle Programme', () => {
    programs.forEach(id => {
      expect(checkProgramPermission(noPerms(), id).allowed).toBe(false);
    });
  });
});

// ── isWithinCancellationDeadline ─────────────────────────────────────────────

describe('isWithinCancellationDeadline', () => {
  const NOW = new Date('2026-05-18T10:00:00').getTime();

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  test('mehr als 3 Stunden vorher → false (Stornierung erlaubt)', () => {
    // Termin um 14:30 = 4,5h nach jetzt
    expect(isWithinCancellationDeadline('2026-05-18', '14:30')).toBe(false);
  });

  test('weniger als 3 Stunden vorher → true (Stornierung gesperrt)', () => {
    // Termin um 11:30 = 1,5h nach jetzt
    expect(isWithinCancellationDeadline('2026-05-18', '11:30')).toBe(true);
  });

  test('exakt 3 Stunden vorher → false (Grenzwert: strict less-than)', () => {
    // Termin um 13:00 = genau 3h nach jetzt; 3h < 3h ist false
    expect(isWithinCancellationDeadline('2026-05-18', '13:00')).toBe(false);
  });

  test('vergangener Termin → true', () => {
    // Termin war gestern
    expect(isWithinCancellationDeadline('2026-05-17', '09:00')).toBe(true);
  });
});

// ── checkGroupSessionCompatibility ───────────────────────────────────────────

describe('checkGroupSessionCompatibility', () => {
  const SESSION_YEAR = 2026;

  // ── Altersgruppen-Trennung ──────────────────────────────────────────────

  describe('Altersgruppen', () => {
    test('Beide Spieler unter 7 Jahren → erlaubt', () => {
      // playerAge = 2026 - 2020 = 6, existingAge = 2026 - 2022 = 4
      expect(checkGroupSessionCompatibility(2020, 'anfaenger', 2022, 'anfaenger', SESSION_YEAR))
        .toEqual({ allowed: true });
    });

    test('Spieler unter 7, Bestehender 7+ → blockiert', () => {
      // player 2020 = age 6, existing 2015 = age 11
      const r = checkGroupSessionCompatibility(2020, 'anfaenger', 2015, 'anfaenger', SESSION_YEAR);
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/0–6/);
    });

    test('Spieler 7+, Bestehender unter 7 → blockiert', () => {
      const r = checkGroupSessionCompatibility(2015, 'anfaenger', 2020, 'anfaenger', SESSION_YEAR);
      expect(r.allowed).toBe(false);
    });
  });

  // ── Experte-Matrix ──────────────────────────────────────────────────────

  describe('experte', () => {
    // pBY = 2010
    test('experte darf mit experte ±1 Jahrgang spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'experte', 2009, 'experte', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'experte', 2010, 'experte', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'experte', 2011, 'experte', SESSION_YEAR).allowed).toBe(true);
    });

    test('experte darf mit profi pBY/-1 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'experte', 2009, 'profi', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'experte', 2010, 'profi', SESSION_YEAR).allowed).toBe(true);
    });

    test('experte darf NICHT mit profi pBY+1 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'experte', 2011, 'profi', SESSION_YEAR).allowed).toBe(false);
    });

    test('experte darf mit amateur pBY-2 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'experte', 2008, 'amateur', SESSION_YEAR).allowed).toBe(true);
    });

    test('experte darf NICHT mit anfaenger spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'experte', 2010, 'anfaenger', SESSION_YEAR).allowed).toBe(false);
      expect(checkGroupSessionCompatibility(2010, 'experte', 2008, 'anfaenger', SESSION_YEAR).allowed).toBe(false);
    });
  });

  // ── Profi-Matrix ────────────────────────────────────────────────────────

  describe('profi', () => {
    test('profi darf mit profi ±1 Jahrgang spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'profi', 2009, 'profi', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'profi', 2010, 'profi', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'profi', 2011, 'profi', SESSION_YEAR).allowed).toBe(true);
    });

    test('profi darf mit experte pBY/+1 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'profi', 2010, 'experte', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'profi', 2011, 'experte', SESSION_YEAR).allowed).toBe(true);
    });

    test('profi darf mit amateur pBY-1 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'profi', 2009, 'amateur', SESSION_YEAR).allowed).toBe(true);
    });

    test('profi darf mit anfaenger pBY-2 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'profi', 2008, 'anfaenger', SESSION_YEAR).allowed).toBe(true);
    });

    test('profi darf NICHT mit anfaenger pBY-3 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'profi', 2007, 'anfaenger', SESSION_YEAR).allowed).toBe(false);
    });
  });

  // ── Amateur-Matrix ──────────────────────────────────────────────────────

  describe('amateur', () => {
    test('amateur darf mit amateur ±1 Jahrgang spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2009, 'amateur', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2010, 'amateur', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2011, 'amateur', SESSION_YEAR).allowed).toBe(true);
    });

    test('amateur darf mit experte pBY+2 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2012, 'experte', SESSION_YEAR).allowed).toBe(true);
    });

    test('amateur darf mit profi pBY/+1 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2010, 'profi', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2011, 'profi', SESSION_YEAR).allowed).toBe(true);
    });

    test('amateur darf mit anfaenger pBY-1/pBY spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2009, 'anfaenger', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'amateur', 2010, 'anfaenger', SESSION_YEAR).allowed).toBe(true);
    });
  });

  // ── Anfänger-Matrix ─────────────────────────────────────────────────────

  describe('anfaenger', () => {
    test('anfaenger darf mit anfaenger ±1 Jahrgang spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'anfaenger', 2009, 'anfaenger', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'anfaenger', 2010, 'anfaenger', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'anfaenger', 2011, 'anfaenger', SESSION_YEAR).allowed).toBe(true);
    });

    test('anfaenger darf mit profi pBY+2 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'anfaenger', 2012, 'profi', SESSION_YEAR).allowed).toBe(true);
    });

    test('anfaenger darf mit amateur pBY/+1 spielen', () => {
      expect(checkGroupSessionCompatibility(2010, 'anfaenger', 2010, 'amateur', SESSION_YEAR).allowed).toBe(true);
      expect(checkGroupSessionCompatibility(2010, 'anfaenger', 2011, 'amateur', SESSION_YEAR).allowed).toBe(true);
    });

    test('anfaenger darf NIEMALS mit experte spielen', () => {
      [2008, 2010, 2012].forEach(by => {
        expect(checkGroupSessionCompatibility(2010, 'anfaenger', by, 'experte', SESSION_YEAR).allowed).toBe(false);
      });
    });
  });
});

// ── canJoinGroupSlot ─────────────────────────────────────────────────────────

describe('canJoinGroupSlot', () => {
  const SESSION_YEAR = 2026;

  test('leerer Slot → immer erlaubt', () => {
    expect(canJoinGroupSlot(player(2010, 'profi'), [], SESSION_YEAR)).toEqual({ allowed: true });
  });

  test('kompatibler Spieler → erlaubt', () => {
    const existing = [player(2010, 'profi')];
    expect(canJoinGroupSlot(player(2011, 'profi'), existing, SESSION_YEAR).allowed).toBe(true);
  });

  // Regression: der reale Vorfall vom 21.08.2026 — ein Experte (2014) und ein
  // Amateur (2019) landeten in derselben Gruppe, weil Mitspieler ohne
  // Jahrgangs-/Stufen-Snapshot aus der Prüfung herausgefiltert wurden und die
  // Gruppe dadurch leer wirkte. Unvollständige Angaben müssen blockieren.
  test('Mitspieler ohne Snapshot blockiert die Gruppe (statt sie zu öffnen)', () => {
    const existing = [{ birthYear: null, level: null }];
    const result = canJoinGroupSlot(player(2014, 'experte'), existing, SESSION_YEAR);
    expect(result.allowed).toBe(false);
  });

  test('Spieler ohne eigenes Level darf nicht in eine Gruppe', () => {
    const existing = [player(2019, 'amateur')];
    expect(canJoinGroupSlot({ birthYear: 2014, level: null }, existing, SESSION_YEAR).allowed).toBe(false);
  });

  test('Experte 2014 und Amateur 2019 bleiben unvereinbar', () => {
    expect(canJoinGroupSlot(player(2014, 'experte'), [player(2019, 'amateur')], SESSION_YEAR).allowed).toBe(false);
    expect(canJoinGroupSlot(player(2019, 'amateur'), [player(2014, 'experte')], SESSION_YEAR).allowed).toBe(false);
  });

  test('inkompatibler Spieler → blockiert', () => {
    const existing = [player(2010, 'experte')];
    const result = canJoinGroupSlot(player(2010, 'anfaenger'), existing, SESSION_YEAR);
    expect(result.allowed).toBe(false);
  });

  test('mehrere bestehende: einer inkompatibel → gesamt blockiert', () => {
    const existing = [
      player(2010, 'profi'),
      player(2010, 'experte'),
    ];
    const result = canJoinGroupSlot(player(2010, 'anfaenger'), existing, SESSION_YEAR);
    expect(result.allowed).toBe(false);
  });

  test('mehrere kompatible bestehende → erlaubt', () => {
    // same-level amateur allows only ±1 birth year; 2011 is within ±1 of both 2010 and 2011
    const existing = [player(2010, 'amateur'), player(2011, 'amateur')];
    expect(canJoinGroupSlot(player(2011, 'amateur'), existing, SESSION_YEAR).allowed).toBe(true);
  });

  test('Spieler der Altersgruppe <7 kann nicht mit 7+ spielen', () => {
    const existing = [player(2015, 'anfaenger')]; // age 11
    const result = canJoinGroupSlot(player(2020, 'anfaenger'), existing, SESSION_YEAR); // age 6
    expect(result.allowed).toBe(false);
  });
});

// ── reconstructGroups ────────────────────────────────────────────────────────

describe('reconstructGroups', () => {
  const SESSION_YEAR = 2026;

  test('leere Buchungsliste → leeres Array', () => {
    expect(reconstructGroups([], 4, SESSION_YEAR)).toEqual([]);
  });

  test('eine Buchung → eine Gruppe mit einem Spieler', () => {
    const result = reconstructGroups(
      [{ birthYear: 2010, level: 'profi', created_at: '2026-05-01T10:00:00Z' }],
      4,
      SESSION_YEAR,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].birthYear).toBe(2010);
  });

  test('kompatible Spieler landen in einer Gruppe (Kapazität reicht)', () => {
    const bookings = [
      { birthYear: 2010, level: 'profi' as PlayerLevel, created_at: '2026-05-01T10:00:00Z' },
      { birthYear: 2010, level: 'profi' as PlayerLevel, created_at: '2026-05-01T11:00:00Z' },
      { birthYear: 2011, level: 'profi' as PlayerLevel, created_at: '2026-05-01T12:00:00Z' },
    ];
    const result = reconstructGroups(bookings, 4, SESSION_YEAR);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
  });

  test('Kapazität überschritten → neue Gruppe beginnt', () => {
    const bookings = Array.from({ length: 5 }, (_, i) => ({
      birthYear: 2010,
      level: 'profi' as PlayerLevel,
      created_at: `2026-05-01T${String(10 + i).padStart(2, '0')}:00:00Z`,
    }));
    const result = reconstructGroups(bookings, 4, SESSION_YEAR);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4);
    expect(result[1]).toHaveLength(1);
  });

  test('inkompatible Spieler landen in separaten Gruppen', () => {
    const bookings = [
      { birthYear: 2010, level: 'experte' as PlayerLevel, created_at: '2026-05-01T10:00:00Z' },
      { birthYear: 2010, level: 'anfaenger' as PlayerLevel, created_at: '2026-05-01T11:00:00Z' },
    ];
    const result = reconstructGroups(bookings, 4, SESSION_YEAR);
    expect(result).toHaveLength(2);
    expect(result[0][0].level).toBe('experte');
    expect(result[1][0].level).toBe('anfaenger');
  });

  test('Buchungen werden nach created_at aufsteigend sortiert (ältere zuerst)', () => {
    // 2010 and 2011 profi are within ±1 year → compatible and land in same group
    const bookings = [
      { birthYear: 2011, level: 'profi' as PlayerLevel, created_at: '2026-05-01T12:00:00Z' },
      { birthYear: 2010, level: 'profi' as PlayerLevel, created_at: '2026-05-01T10:00:00Z' },
    ];
    const result = reconstructGroups(bookings, 4, SESSION_YEAR);
    // After ascending sort: 2010 (10:00) first, 2011 (12:00) second
    expect(result[0][0].birthYear).toBe(2010);
    expect(result[0][1].birthYear).toBe(2011);
  });

  test('Buchungen ohne created_at werden zuerst platziert', () => {
    const bookings = [
      { birthYear: 2012, level: 'profi' as PlayerLevel, created_at: '2026-05-01T10:00:00Z' },
      { birthYear: 2010, level: 'profi' as PlayerLevel }, // kein created_at
    ];
    const result = reconstructGroups(bookings, 4, SESSION_YEAR);
    // '' < '2026-...' → Buchung ohne Timestamp kommt zuerst
    expect(result[0][0].birthYear).toBe(2010);
  });
});

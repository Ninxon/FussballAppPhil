import { BookingPermissions, PlayerLevel } from '../types';
import { PROGRAM_CATEGORY, PROGRAM_CAPACITY, ProgramId } from '../constants/programs';

export type AppointmentSlim = { date: string; time: string; status: string; program: string };

// Max. 2 Termine pro Tag, kein Doppel-Slot zur gleichen Zeit
export function checkDailyConflict(
  existing: AppointmentSlim[],
  newDate: string,
  newTime?: string,
): { allowed: boolean; reason?: string } {
  const confirmed = existing.filter(a => a.date === newDate && a.status === 'confirmed');
  if (confirmed.length >= 2) return { allowed: false, reason: 'Du hast an diesem Tag bereits zwei Termine.' };
  if (newTime && confirmed.some(a => a.time === newTime)) {
    return { allowed: false, reason: 'Du hast an diesem Tag zur gleichen Uhrzeit bereits einen Termin.' };
  }
  return { allowed: true };
}

// Prüft ob Kunde diesen Programmtyp buchen darf
export function checkProgramPermission(
  permissions: BookingPermissions,
  programId: ProgramId,
): { allowed: boolean; reason?: string } {
  const flagMap: Record<ProgramId, keyof BookingPermissions> = {
    individual:           'can_book_individual',
    gruppe:               'can_book_gruppe',
    athletik:             'can_book_athletik',
    torhueter_individual: 'can_book_torhueter_individual',
    torhueter_gruppe:     'can_book_torhueter_gruppe',
  };
  const flag = flagMap[programId];
  if (!flag || !permissions[flag]) {
    return { allowed: false, reason: 'Du bist für dieses Training nicht freigeschaltet.' };
  }
  return { allowed: true };
}

// true = Frist überschritten, Stornierung nicht mehr möglich
export function isWithinCancellationDeadline(date: string, time: string): boolean {
  const apptDateTime = new Date(`${date}T${time}:00`);
  return apptDateTime.getTime() - Date.now() < 3 * 60 * 60 * 1000;
}

export function isSlotInPast(slotTime: string, todayStr: string, selectedDate: string): boolean {
  if (selectedDate !== todayStr) return false;
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return slotTime <= nowStr;
}

export function easterDate(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Pro Jahr einmal berechnen — die Kalender-Raster rufen germanHolidays pro
// Zelle auf, und der Gauß-Oster-Algorithmus muss dafür nicht 42x laufen.
const holidayCache = new Map<number, Set<string>>();

export function germanHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const result = computeGermanHolidays(year);
  holidayCache.set(year, result);
  return result;
}

function computeGermanHolidays(year: number): Set<string> {
  const e = easterDate(year);
  const add = (dt: Date, n: number) => {
    const r = new Date(dt);
    r.setDate(r.getDate() + n);
    return r;
  };
  const s = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return new Set([
    `${year}-01-01`,   // Neujahr
    s(add(e, -2)),     // Karfreitag
    s(add(e, 1)),      // Ostermontag
    `${year}-05-01`,   // Tag der Arbeit
    s(add(e, 39)),     // Christi Himmelfahrt
    s(add(e, 50)),     // Pfingstmontag
    s(add(e, 60)),     // Fronleichnam (Hessen)
    `${year}-10-03`,   // Tag der Deutschen Einheit
    `${year}-12-25`,   // 1. Weihnachtstag
    `${year}-12-26`,   // 2. Weihnachtstag
  ]);
}

// Zusätzliche gesperrte Zeiträume (z.B. Schulferien), kommen aus blocked_periods.
export type BlockedPeriod = { start_date: string; end_date: string };

// YYYY-MM-DD-Strings sind lexikografisch vergleichbar -> kein Date-Parsing nötig.
export function isBlockedByPeriod(dateStr: string, periods: BlockedPeriod[]): boolean {
  return periods.some(p => dateStr >= p.start_date && dateStr <= p.end_date);
}

/**
 * Prüft ob zwei Spieler in dieselbe Gruppe passen (bidirektional aufrufen).
 * playerBirthYear/Level = prüfender Spieler, existingBirthYear/Level = bestehender Spieler.
 */
export function checkGroupSessionCompatibility(
  playerBirthYear: number | null,
  playerLevel: PlayerLevel | null,
  existingBirthYear: number | null,
  existingLevel: PlayerLevel | null,
  sessionYear: number,
): { allowed: boolean; reason?: string } {
  // Unvollständige Angaben sind KEIN Freifahrtschein: wer sich nicht prüfen
  // lässt, gilt als inkompatibel. Vorher wurden solche Spieler stillschweigend
  // übersprungen — die Gruppe wirkte leer und nahm jeden auf.
  if (playerBirthYear == null || playerLevel == null) {
    return { allowed: false, reason: 'Jahrgang oder Stufe des Spielers fehlt — Gruppenprüfung nicht möglich.' };
  }
  if (existingBirthYear == null || existingLevel == null) {
    return { allowed: false, reason: 'Ein Spieler im Slot hat keine Jahrgangs-/Stufenangabe.' };
  }

  const playerAge = sessionYear - playerBirthYear;
  const existingAge = sessionYear - existingBirthYear;

  // 0–6 nur mit 0–6, 7+ nur mit 7+
  if (playerAge < 7 && existingAge < 7) return { allowed: true };
  if (playerAge < 7 || existingAge < 7) {
    return { allowed: false, reason: 'Altersgruppen 0–6 und 7+ können nicht kombiniert werden.' };
  }

  const pBY = playerBirthYear;
  const sBY = existingBirthYear;
  const sL  = existingLevel;

  const ok = (levels: PlayerLevel[], years: number[]) =>
    levels.includes(sL) && years.includes(sBY);

  switch (playerLevel) {
    case 'experte':
      if (ok(['experte'], [pBY - 1, pBY, pBY + 1])) return { allowed: true };
      if (ok(['profi'],   [pBY - 1, pBY]))           return { allowed: true };
      if (ok(['amateur'], [pBY - 2]))                return { allowed: true };
      break;

    case 'profi':
      if (ok(['profi'],     [pBY - 1, pBY, pBY + 1])) return { allowed: true };
      if (ok(['experte'],   [pBY, pBY + 1]))            return { allowed: true };
      if (ok(['amateur'],   [pBY - 1]))                 return { allowed: true };
      if (ok(['anfaenger'], [pBY - 2]))                 return { allowed: true };
      break;

    case 'amateur':
      if (ok(['amateur'],   [pBY - 1, pBY, pBY + 1])) return { allowed: true };
      if (ok(['experte'],   [pBY + 2]))                 return { allowed: true };
      if (ok(['profi'],     [pBY, pBY + 1]))            return { allowed: true };
      if (ok(['anfaenger'], [pBY - 1, pBY]))            return { allowed: true };
      break;

    case 'anfaenger':
      if (ok(['anfaenger'], [pBY - 1, pBY, pBY + 1])) return { allowed: true };
      // experte: nie erlaubt
      if (ok(['profi'],   [pBY + 2]))                return { allowed: true };
      if (ok(['amateur'], [pBY, pBY + 1]))           return { allowed: true };
      break;
  }

  return {
    allowed: false,
    reason: `Jahrgang ${existingBirthYear} (${existingLevel}) passt nicht zur Stufe des Spielers.`,
  };
}

/**
 * Prüft ob ein neuer Spieler mit ALLEN bestehenden Spielern im Slot kompatibel ist (bidirektional).
 */
export function canJoinGroupSlot(
  newPlayer: { birthYear: number | null; level: PlayerLevel | null },
  existingPlayers: Array<{ birthYear: number | null; level: PlayerLevel | null }>,
  sessionYear: number,
): { allowed: boolean; reason?: string } {
  for (const existing of existingPlayers) {
    const c1 = checkGroupSessionCompatibility(
      newPlayer.birthYear, newPlayer.level,
      existing.birthYear, existing.level,
      sessionYear,
    );
    if (!c1.allowed) return c1;

    const c2 = checkGroupSessionCompatibility(
      existing.birthYear, existing.level,
      newPlayer.birthYear, newPlayer.level,
      sessionYear,
    );
    if (!c2.allowed) return { allowed: false, reason: 'Gruppe nicht kompatibel.' };
  }
  return { allowed: true };
}

/**
 * Rekonstruiert Gruppen aus bestehenden Buchungen per First-Fit-Algorithmus.
 * Jede Buchung wird der ersten kompatiblen Gruppe zugewiesen, die noch Platz hat.
 */
export function reconstructGroups(
  bookings: Array<{ birthYear: number | null; level: PlayerLevel | null; created_at?: string }>,
  groupSize: number,
  sessionYear: number,
): Array<Array<{ birthYear: number | null; level: PlayerLevel | null }>> {
  const sorted = [...bookings].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );
  const groups: Array<Array<{ birthYear: number | null; level: PlayerLevel | null }>> = [];
  for (const booking of sorted) {
    let assigned = false;
    for (const group of groups) {
      if (group.length < groupSize && canJoinGroupSlot(booking, group, sessionYear).allowed) {
        group.push(booking);
        assigned = true;
        break;
      }
    }
    if (!assigned) groups.push([{ birthYear: booking.birthYear, level: booking.level }]);
  }
  return groups;
}

export function isBookableDay(dateStr: string, blockedPeriods: BlockedPeriod[] = []): boolean {
  // Mittags-Anker, damit YYYY-MM-DD nicht als UTC-Mitternacht geparst wird
  // (sonst kann getDay() in negativen Zeitzonen einen Tag verrutschen).
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  if (germanHolidays(d.getFullYear()).has(dateStr)) return false;
  if (isBlockedByPeriod(dateStr, blockedPeriods)) return false;
  return true;
}

// Erzeugt die Termin-Daten einer fortlaufenden Serie (Admin-Serienbuchung).
// Arbeitet bewusst mit lokaler Zeit (new Date(y, m, d) = lokale Mitternacht),
// damit die ISO-Daten nicht durch UTC-Verschiebung auf den Vortag rutschen.

export type RecurrenceInterval = 'weekly' | 'biweekly' | 'monthly';

export type RecurrenceEnd =
  | { type: 'count'; count: number }   // Anzahl Termine inkl. Starttermin
  | { type: 'until'; date: string };   // bis-Datum (inklusive)

// Sicherheitsobergrenze, damit ein fehlerhaftes Enddatum keine Riesenliste erzeugt.
const HARD_CAP = 500;

const pad = (n: number) => String(n).padStart(2, '0');

const toISO = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseISO = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// n-tes Vorkommen (ordinal 1–5) eines Wochentags (0=So…6=Sa) im Monat.
// null, wenn der Monat dieses Vorkommen nicht hat (z. B. kein 5. Mittwoch).
const nthWeekdayOfMonth = (
  year: number, month: number, weekday: number, ordinal: number,
): Date | null => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7;
  const result = new Date(year, month, day);
  return result.getMonth() === month ? result : null;
};

/**
 * Liefert aufsteigend sortierte ISO-Daten (YYYY-MM-DD) ab startDate.
 * - weekly / biweekly: alle 7 bzw. 14 Tage (gleicher Wochentag)
 * - monthly: gleicher Wochentag-Rang im Monat (z. B. „3. Mittwoch") —
 *   so bleibt der Wochentag konsistent zum Trainer-Slot. Monate ohne dieses
 *   Vorkommen (z. B. fehlender 5. Montag) werden übersprungen.
 * Gibt [] zurück bei ungültigen Eingaben.
 */
export function generateRecurringDates(
  startDate: string,
  interval: RecurrenceInterval,
  end: RecurrenceEnd,
): string[] {
  const start = parseISO(startDate);
  if (isNaN(start.getTime())) return [];

  const maxOccurrences =
    end.type === 'count' ? Math.min(Math.max(end.count, 0), HARD_CAP) : HARD_CAP;
  const until = end.type === 'until' ? parseISO(end.date) : null;
  if (until && isNaN(until.getTime())) return [];

  const dates: string[] = [];

  if (interval === 'monthly') {
    const weekday = start.getDay();
    const ordinal = Math.ceil(start.getDate() / 7);
    let year = start.getFullYear();
    let month = start.getMonth();
    let monthsScanned = 0;
    while (dates.length < maxOccurrences && monthsScanned < 600) {
      const occ = nthWeekdayOfMonth(year, month, weekday, ordinal);
      monthsScanned++;
      if (occ && occ.getTime() >= start.getTime()) {
        if (until && occ.getTime() > until.getTime()) break;
        dates.push(toISO(occ));
      }
      if (++month > 11) { month = 0; year++; }
    }
    return dates;
  }

  const step = interval === 'weekly' ? 7 : 14;
  const cursor = new Date(start);
  while (dates.length < maxOccurrences) {
    if (until && cursor.getTime() > until.getTime()) break;
    dates.push(toISO(cursor));
    cursor.setDate(cursor.getDate() + step);
  }
  return dates;
}

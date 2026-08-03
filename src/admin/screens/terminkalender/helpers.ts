import { DE_MONTHS } from '../../../constants/i18n';
import { DE_DAYS } from './theme';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' (lokale Komponenten, kein UTC-Versatz). */
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> 'Mo, 3. August 2026' */
export function fmtDayLong(ds: string): string {
  const d = new Date(ds + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;
  return `${DE_DAYS[dow]}, ${d.getDate()}. ${DE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Montag der Woche, in der das Referenzdatum liegt. */
export function getWeekStart(ref: Date): Date {
  const d = new Date(ref);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

/** Label der Wochenansicht, monatsübergreifend korrekt. */
export function weekLabel(days: Date[]): string {
  const start = days[0], end = days[6];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}. – ${end.getDate()}. ${DE_MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()}. ${DE_MONTHS[start.getMonth()]} – ${end.getDate()}. ${DE_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

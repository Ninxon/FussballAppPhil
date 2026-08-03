import { DE_DAYS_FULL, DE_MONTHS, DE_MONTHS_S } from '../constants/i18n';

// Alle Funktionen arbeiten string-basiert auf 'YYYY-MM-DD' (DST-sicher),
// außer fmtTimestampShort, das echte ISO-Timestamps (created_at) formatiert.

export function todayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' → 'Montag, 3. August 2026' */
export function fmtDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dow = DE_DAYS_FULL[(new Date(y, m - 1, d).getDay() + 6) % 7];
  return `${dow}, ${d}. ${DE_MONTHS[m - 1]} ${y}`;
}

/** 'YYYY-MM-DD' → '3. Aug' */
export function fmtShort(s: string): string {
  const [, m, d] = s.split('-').map(Number);
  return `${d}. ${DE_MONTHS_S[m - 1]}`;
}

/** 'YYYY-MM-DD' → '03.08.2026' */
export function fmtDateShort(ds: string): string {
  const [y, m, d] = ds.split('-');
  return `${d}.${m}.${y}`;
}

/** ISO-Timestamp (z. B. created_at) → '03.08.2026' */
export function fmtTimestampShort(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Zellen eines Monatsrasters (Montag-first): führende nulls für Leerzellen,
 * dann die Tage 1..n.
 */
export function monthCells(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

// PostgREST serializes native time columns as "HH:MM:SS" — normalize to "HH:MM".
export const fmtTime = <T extends { time?: string | null }>(a: T): T =>
  ({ ...a, time: a.time ? a.time.slice(0, 5) : a.time });

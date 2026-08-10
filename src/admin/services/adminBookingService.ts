import { AppointmentService } from '../../services/appointmentService';
import { fmtTime } from '../../utils/date';
import { validateBookingRules, findReservationConflict, BookingContext, BookingRequest } from './bookingValidation';
import type { AdminAppointment } from '../hooks/useAdminData';

// Buchungs-Orchestrierung des Admin-Bereichs: verbindet die reinen Regeln
// (bookingValidation) mit der Datenbank. Der Hook bleibt dadurch reine
// Zustandsverwaltung.
export { validateBookingRules, findReservationConflict } from './bookingValidation';
export type { BookingContext, BookingRequest } from './bookingValidation';

/** Regelprüfung inkl. Tageslimit-Abfrage gegen die DB. null = buchbar. */
export async function validateBooking(ctx: BookingContext, req: BookingRequest): Promise<string | null> {
  const ruleError = validateBookingRules(ctx, req);
  if (ruleError) return ruleError;

  const { data: conflicts } = await AppointmentService.checkDailyConflict(req.playerId, req.date);
  if (conflicts && conflicts.length >= 2) {
    return 'Der Kunde hat an diesem Tag bereits zwei Termine.';
  }
  if (conflicts && conflicts.some((c: { time: string }) => c.time.slice(0, 5) === req.time)) {
    return 'Der Kunde hat an diesem Tag zur gleichen Uhrzeit bereits einen Termin.';
  }
  return null;
}

/** Reiner INSERT ohne Validierung; Standort + Spielerdaten werden abgeleitet. */
export async function insertBooking(ctx: BookingContext, req: BookingRequest) {
  const customer = ctx.customers.find(c => c.id === req.playerId);
  const birthYear = customer?.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;
  const level = customer?.level ?? null;

  // Standort folgt dem gewählten Trainer-Slot (location des Zeitplan-Eintrags).
  const jsDay = new Date(req.date + 'T12:00:00').getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;
  const slotLocation = req.trainerId
    ? (ctx.trainerSchedules.find(s => s.trainer_id === req.trainerId && s.day_of_week === dayOfWeek && s.time === req.time)?.location ?? null)
    : null;

  return AppointmentService.insert({
    player_id: req.playerId, date: req.date, time: req.time, status: 'confirmed', program: req.program,
    ...(req.trainerId ? { trainer_id: req.trainerId } : {}),
    // Immer schreiben, auch als null: ein fehlendes Feld wurde früher gar nicht
    // erst gesetzt, und solche Termine waren dann für jede Gruppenprüfung
    // unsichtbar. Der Snapshot ist der Prüfwert — er darf nicht stillschweigend
    // entfallen, nur weil das Profil unvollständig ist.
    session_birth_year: birthYear,
    session_level: level,
    ...(slotLocation ? { location: slotLocation } : {}),
  });
}

export type RecurringResult = {
  error: string | null;
  conflicts: { date: string; reason: string }[];
  created: AdminAppointment[];
  /** Mindestens ein Konflikt ist ein fremder Stammplatz — übergehbar. */
  reservationConflict?: boolean;
};

/**
 * Serien-Buchung („alles oder nichts"): erst werden ALLE Termine validiert.
 * Scheitert auch nur einer, wird nichts gebucht und die Konfliktliste
 * zurückgegeben. Sind alle sauber, werden sie eingefügt; bricht ein INSERT
 * wider Erwarten ab (z. B. DB-Kapazitäts-Trigger), werden die bereits
 * eingefügten Termine wieder gelöscht (Rollback) — kein Teil-Ergebnis.
 */
export async function bookRecurring(
  ctx: BookingContext, dates: string[], req: Omit<BookingRequest, 'date'>,
): Promise<RecurringResult> {
  if (dates.length === 0) {
    return { error: 'Keine Termine im gewählten Zeitraum.', conflicts: [], created: [] };
  }

  const conflicts: { date: string; reason: string }[] = [];
  let reservationConflict = false;
  for (const date of dates) {
    const reason = await validateBooking(ctx, { ...req, date });
    if (reason) {
      conflicts.push({ date, reason });
      // Damit die UI den Übergehen-Schalter anbieten kann, statt den Admin
      // rätseln zu lassen, warum eine sichtbar leere Serie nicht buchbar ist.
      if (!req.skipReservation && findReservationConflict(ctx, { ...req, date }) === reason) {
        reservationConflict = true;
      }
    }
  }
  if (conflicts.length > 0) {
    return { error: null, conflicts, created: [], reservationConflict };
  }

  const inserted: AdminAppointment[] = [];
  for (const date of dates) {
    const { data, error } = await insertBooking(ctx, { ...req, date });
    if (error || !data) {
      for (const a of inserted) {
        await AppointmentService.delete(a.id);
      }
      return {
        error: `Buchung am ${date} fehlgeschlagen (${error?.message ?? 'unbekannt'}). Serie abgebrochen, keine Termine gespeichert.`,
        conflicts: [],
        created: [],
      };
    }
    inserted.push(fmtTime(data as AdminAppointment));
  }

  return { error: null, conflicts: [], created: inserted };
}

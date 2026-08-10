import { PlayerLevel, TrainerSchedule, SlotReservation } from '../../types';
import { PROGRAM_CATEGORY, ProgramId } from '../../constants/programs';
import { canJoinGroupSlot, checkProgramPermission } from '../../utils/bookingRules';
import type { CustomerProfile, AdminAppointment, TrainerProfile } from '../hooks/useAdminData';

// Reine Buchungsregeln des Admin-Bereichs: keine Datenbank, kein React —
// alles, was die Prüfung braucht, kommt als Kontext herein. Dadurch sind die
// Regeln isoliert testbar (src/__tests__/adminBookingService.test.ts).
export type BookingContext = {
  customers: CustomerProfile[];
  allAppointments: AdminAppointment[];
  trainers: TrainerProfile[];
  trainerSchedules: TrainerSchedule[];
  /** Stammplätze; fehlt der Eintrag, wird nicht auf Reservierungen geprüft. */
  slotReservations?: SlotReservation[];
};

export type BookingRequest = {
  playerId: string;
  date: string;
  time: string;
  program: string;
  trainerId?: string | null;
  /** Alters-/Level-Prüfung für DIESE Buchung übergehen (Admin-Entscheidung). */
  skipGroupCompat?: boolean;
  /** Fremden Stammplatz für DIESE Buchung übergehen (Admin-Entscheidung). */
  skipReservation?: boolean;
};

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

/**
 * Nimmt diese Buchung den letzten Trainer weg, der für einen fremden Stammplatz
 * gebraucht wird? null = nein.
 *
 * Reservierungen hängen an (Wochentag, Uhrzeit, Standort), nicht an einem
 * bestimmten Trainer — welcher Trainer den festen Platz übernimmt, entscheidet
 * sich erst bei der Buchung. Daher wird gezählt statt zugeordnet: nur wenn der
 * Admin einen komplett freien Trainer wählt UND danach nicht mehr genug freie
 * Trainer für die offenen Reservierungen bleiben, ist der Stammplatz in Gefahr.
 * Wer eine bestehende Gruppe auffüllt, nimmt niemandem etwas weg.
 */
export function findReservationConflict(ctx: BookingContext, req: BookingRequest): string | null {
  const { playerId, date, time, program, trainerId } = req;
  if (!ctx.slotReservations || ctx.slotReservations.length === 0 || !trainerId) return null;

  const jsDay = new Date(date + 'T12:00:00').getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  const slot = ctx.trainerSchedules.find(
    s => s.trainer_id === trainerId && s.day_of_week === dayOfWeek && s.time === time,
  );
  const location = slot?.location ?? null;
  if (!location) return null;

  const specialtyOf = (p: string) =>
    p === 'torhueter_individual' || p === 'torhueter_gruppe' ? 'torwart' : 'spieler';
  const neededSpecialty = specialtyOf(program);

  // Offene Stammplätze an genau diesem Slot: nicht der Spieler selbst, und der
  // Inhaber hat an diesem Datum zu dieser Zeit noch nicht gebucht.
  const openReservations = ctx.slotReservations.filter(r =>
    r.day_of_week === dayOfWeek &&
    r.time === time &&
    r.location === location &&
    specialtyOf(r.program) === neededSpecialty &&
    r.player_id !== playerId &&
    !ctx.allAppointments.some(
      a => a.player_id === r.player_id && a.date === date && a.time === time && a.status === 'confirmed',
    ),
  );
  if (openReservations.length === 0) return null;

  const trainerIdsAtSlot = ctx.trainers
    .filter(t => (t.trainer_specialty ?? 'spieler') === neededSpecialty)
    .map(t => t.id)
    .filter(id => ctx.trainerSchedules.some(
      s => s.trainer_id === id && s.day_of_week === dayOfWeek && s.time === time && s.location === location,
    ));

  const freeTrainerIds = trainerIdsAtSlot.filter(id => !ctx.allAppointments.some(
    a => a.trainer_id === id && a.date === date && a.time === time && a.status === 'confirmed',
  ));

  // Ein bereits belegter Trainer war für den Stammplatz ohnehin nicht mehr da.
  if (!freeTrainerIds.includes(trainerId)) return null;
  if (freeTrainerIds.length > openReservations.length) return null;

  const names = openReservations
    .map(r => ctx.customers.find(c => c.id === r.player_id)?.full_name ?? 'einem anderen Spieler')
    .join(', ');
  return `${WEEKDAYS[dayOfWeek - 1]} ${time} ist am Standort ${location} fester Trainingsplatz von ${names}.`;
}

/** null = buchbar, sonst die deutsche Begründung. */
export function validateBookingRules(ctx: BookingContext, req: BookingRequest, now = new Date()): string | null {
  const { playerId, date, time, program, trainerId, skipGroupCompat = false, skipReservation = false } = req;

  // No bookings in the past — neither past days nor past times today. The
  // time guard also catches the default slot staying selected after its chip
  // was disabled (e.g. 13:00 still set when it is already afternoon).
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (date < today) return 'Datum darf nicht in der Vergangenheit liegen.';
  if (date === today && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`) {
    return 'Diese Uhrzeit liegt bereits in der Vergangenheit.';
  }

  const customer = ctx.customers.find(c => c.id === playerId);
  if (customer) {
    const permCheck = checkProgramPermission(customer, program as ProgramId);
    if (!permCheck.allowed) {
      return permCheck.reason ?? 'Kunde hat keine Berechtigung für dieses Programm.';
    }
  }

  // Ohne Trainer kein Standort — und ohne Standort kein Termin (appointments.location
  // ist NOT NULL). Fachlich wird ohnehin immer mit Trainer gebucht; hier steht die
  // Regel explizit, damit daraus eine klare Meldung wird statt eines DB-Fehlers.
  if (!trainerId) {
    return 'Bitte einen Trainer auswählen — daran hängt der Standort des Termins.';
  }

  {
    const jsDay = new Date(date + 'T12:00:00').getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const trainerHasSlot = ctx.trainerSchedules.some(
      s => s.trainer_id === trainerId && s.day_of_week === dayOfWeek && s.time === time,
    );
    if (!trainerHasSlot) {
      const trainerName = ctx.trainers.find(t => t.id === trainerId)?.full_name ?? 'Trainer';
      return `${trainerName} hat zu dieser Zeit keinen Unterricht eingeplant.`;
    }

    // Ein Spieler-Trainer macht pro Slot entweder Individual- ODER Gruppentraining.
    const trainer = ctx.trainers.find(t => t.id === trainerId);
    if (trainer?.trainer_specialty === 'spieler') {
      const slotBookings = ctx.allAppointments.filter(
        a => a.trainer_id === trainerId && a.date === date && a.time === time && a.status === 'confirmed',
      );
      if (slotBookings.length > 0) {
        const newCat = PROGRAM_CATEGORY[program as ProgramId] ?? 'individual';
        const existCat = PROGRAM_CATEGORY[slotBookings[0].program as ProgramId] ?? 'individual';
        if (newCat !== existCat) {
          return `Trainer hat in diesem Slot bereits ${existCat === 'individual' ? 'Individual' : 'Gruppen'}training.`;
        }
      }
    }
  }

  const birthYear = customer?.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;
  const level = customer?.level ?? null;

  // Alters-/Level-Kompatibilität kann pro Spieler (Profil-Flag) oder pro
  // Buchung (skipGroupCompat) durch den Admin übergangen werden. Nur DIESER
  // Check entfällt dann — Kapazität, Tageslimit etc. bleiben aktiv.
  const exemptCompat = skipGroupCompat || customer?.skip_group_age_level_check === true;
  // Kein "&& birthYear && level" mehr: fehlten die Angaben, entfiel die Prüfung
  // komplett und der Spieler passte überall hinein. Jetzt lehnt canJoinGroupSlot
  // ab — bewusst übergehen kann der Admin weiterhin per skip_group_age_level_check.
  if (PROGRAM_CATEGORY[program as ProgramId] === 'gruppe' && !exemptCompat) {
    // Ein Trainer = eine Gruppe (Kapazität 4, ein Programm pro Trainer/Slot).
    // Daher nur gegen die Spieler DESSELBEN Trainers auf Kompatibilität prüfen —
    // sonst blockiert die erste Gruppe fälschlich jede weitere Gruppe (anderer
    // Trainer) im selben Slot. Ohne gewählten Trainer fällt es auf slot-weit zurück.
    const slotAppts = ctx.allAppointments.filter(
      a => a.date === date && a.time === time && a.program === program && a.status === 'confirmed'
        && (trainerId ? a.trainer_id === trainerId : true),
    );
    // Termine ohne Snapshot werden NICHT mehr weggefiltert — sie blockieren die
    // Gruppe, statt unsichtbar zu sein und sie fälschlich frei erscheinen zu lassen.
    const existingPlayers = slotAppts
      .map(a => ({
        birthYear: a.session_birth_year ?? null,
        level: (a.session_level ?? null) as PlayerLevel | null,
      }));
    if (existingPlayers.length > 0) {
      const check = canJoinGroupSlot({ birthYear, level }, existingPlayers, parseInt(date.slice(0, 4)));
      if (!check.allowed) return check.reason ?? 'Gruppe nicht kompatibel.';
    }
  }

  // Zuletzt geprüft, weil es die einzige Regel ist, die der Admin bewusst
  // übergehen darf — echte Fehler (Vergangenheit, Berechtigung, Gruppe) sollen
  // vorher stehen und nicht hinter einem Schalter verschwinden.
  if (!skipReservation) {
    const reservationConflict = findReservationConflict(ctx, req);
    if (reservationConflict) return reservationConflict;
  }

  return null;
}

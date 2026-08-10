import { PlayerLevel, TrainerSchedule } from '../../types';
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
};

export type BookingRequest = {
  playerId: string;
  date: string;
  time: string;
  program: string;
  trainerId?: string | null;
  /** Alters-/Level-Prüfung für DIESE Buchung übergehen (Admin-Entscheidung). */
  skipGroupCompat?: boolean;
};

/** null = buchbar, sonst die deutsche Begründung. */
export function validateBookingRules(ctx: BookingContext, req: BookingRequest, now = new Date()): string | null {
  const { playerId, date, time, program, trainerId, skipGroupCompat = false } = req;

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

  if (trainerId) {
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

  return null;
}

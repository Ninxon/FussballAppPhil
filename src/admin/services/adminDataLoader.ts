import { TrainerSchedule } from '../../types';
import { AppointmentService } from '../../services/appointmentService';
import { ProfileService } from '../../services/profileService';
import { PlayerService } from '../../services/playerService';
import { TokenService } from '../../services/tokenService';
import { TrainerScheduleService } from '../../services/trainerScheduleService';
import { fmtTime } from '../../utils/date';
import { supabase } from '../../lib/supabase';
import type { CustomerProfile, AdminAppointment, TrainerProfile } from '../hooks/useAdminData';

export type AdminDataSnapshot = {
  customers: CustomerProfile[];
  appointments: AdminAppointment[];
  trainers: TrainerProfile[];
  trainerSchedules: TrainerSchedule[];
  tokenCountsByPlayer: Record<string, { individual: number; gruppe: number }>;
  trainerMonthlyCounts: Record<string, Record<string, number>>;
  /** Erster Fehler eines der sechs Fetches (null = alles geladen). */
  error: string | null;
};

// Laedt den kompletten Admin-Datenstand in einem Rutsch und bringt die Rohdaten
// in die Form, die die Admin-UI erwartet. Kein React — nur I/O + Mapping.
export async function fetchAdminData(): Promise<AdminDataSnapshot> {
  const [
    { data: playerRows, error: profilesErr },
    { data: appointments, error: apptsErr },
    { data: trainerProfiles, error: trainersErr },
    { data: allTokens, error: tokensErr },
    { data: schedules, error: schedulesErr },
    { data: monthlyCounts, error: countsErr },
  ] = await Promise.all([
    PlayerService.fetchAllWithParent(),
    AppointmentService.fetchAllDesc(),
    ProfileService.fetchTrainers(),
    TokenService.fetchAllActive(),
    TrainerScheduleService.fetchAll(),
    supabase.rpc('get_trainer_monthly_counts'),
  ]);

  const firstError = profilesErr ?? apptsErr ?? trainersErr ?? tokensErr ?? schedulesErr ?? countsErr;

  // players-Zeile (+ Eltern) auf die CustomerProfile-Form der Admin-UI mappen.
  const customers: CustomerProfile[] = (playerRows ?? []).map((pl: any) => ({
    id: pl.id,
    parent_id: pl.parent_id,
    full_name: pl.name ?? '',
    email: pl.parent?.email ?? null,
    phone: pl.parent?.phone ?? '',
    address: pl.parent?.address ?? null,
    parent_name: pl.parent?.full_name ?? null,
    birth_date: pl.birth_date ?? null,
    location: pl.location ?? null,
    player_type: pl.player_type ?? null,
    customer_number: pl.player_number,
    is_active: pl.is_active,
    role: 'customer',
    level: pl.level ?? null,
    skip_group_age_level_check: pl.skip_group_age_level_check ?? false,
    individual_billed_since: pl.individual_billed_since,
    can_book_individual: pl.can_book_individual,
    can_book_gruppe: pl.can_book_gruppe,
    can_book_athletik: pl.can_book_athletik,
    can_book_torhueter_individual: pl.can_book_torhueter_individual,
    can_book_torhueter_gruppe: pl.can_book_torhueter_gruppe,
  }));

  // Token-Zaehler pro Spieler (player_id = customer.id der Admin-UI).
  const tokenCountsByPlayer: Record<string, { individual: number; gruppe: number }> = {};
  for (const token of (allTokens ?? []) as { player_id: string; category: string }[]) {
    if (!tokenCountsByPlayer[token.player_id]) tokenCountsByPlayer[token.player_id] = { individual: 0, gruppe: 0 };
    if (token.category === 'individual') tokenCountsByPlayer[token.player_id].individual++;
    else if (token.category === 'gruppe') tokenCountsByPlayer[token.player_id].gruppe++;
  }

  const trainerMonthlyCounts: Record<string, Record<string, number>> = {};
  for (const row of (monthlyCounts ?? []) as { trainer_id: string; year_month: string; sessions: number }[]) {
    if (!trainerMonthlyCounts[row.trainer_id]) trainerMonthlyCounts[row.trainer_id] = {};
    trainerMonthlyCounts[row.trainer_id][row.year_month] = row.sessions;
  }

  return {
    customers,
    appointments: ((appointments ?? []) as AdminAppointment[]).map(fmtTime),
    trainers: (trainerProfiles ?? []) as TrainerProfile[],
    trainerSchedules: ((schedules ?? []) as TrainerSchedule[]).map(fmtTime),
    tokenCountsByPlayer,
    trainerMonthlyCounts,
    error: firstError ? (firstError.message ?? 'Fehler beim Laden.') : null,
  };
}

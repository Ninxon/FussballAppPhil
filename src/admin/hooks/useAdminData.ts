import { useState, useEffect } from 'react';
import { PlayerLevel, PlayerType, BookingPermissions, TrainerSchedule, TrainerSpecialty } from '../../types';
import { AppointmentService } from '../../services/appointmentService';
import { ProfileService } from '../../services/profileService';
import { TokenService } from '../../services/tokenService';
import { TrainerScheduleService } from '../../services/trainerScheduleService';
import { CustomerService, CreateCustomerParams, extractFunctionError } from '../services/customerService';
import { PROGRAM_CATEGORY, ProgramId } from '../../constants/programs';
import { canJoinGroupSlot, checkProgramPermission } from '../../utils/bookingRules';
import { supabase } from '../../lib/supabase';

export type CustomerProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  birth_date: string | null;
  address: string | null;
  parent_name: string | null;
  location: string | null;
  player_type: PlayerType | null;
  customer_number: number;
  is_active: boolean;
  role: string;
  level: PlayerLevel | null;
  skip_group_age_level_check: boolean;
} & BookingPermissions;

export type AdminAppointment = {
  id: string;
  user_id: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  program: string;
  trainer_id?: string | null;
  session_level?: string | null;
  session_birth_year?: number | null;
  attended?: boolean | null;
  location?: string | null;
};

export type TrainerProfile = {
  id: string;
  full_name: string;
  trainer_specialty?: TrainerSpecialty | null;
};

// PostgREST serializes native time columns as "HH:MM:SS" — normalize to "HH:MM".
const fmtTime = <T extends { time?: string | null }>(a: T): T =>
  ({ ...a, time: a.time ? a.time.slice(0, 5) : a.time });

export function useAdminData() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [allAppointments, setAllAppointments] = useState<AdminAppointment[]>([]);
  const [trainers, setTrainers] = useState<TrainerProfile[]>([]);
  const [trainerSchedules, setTrainerSchedules] = useState<TrainerSchedule[]>([]);
  const [trainerMonthlyCounts, setTrainerMonthlyCounts] = useState<Record<string, Record<string, number>>>({});
  const [activeTokensByCustomer, setActiveTokensByCustomer] = useState<Record<string, { individual: number; gruppe: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const [
      { data: profiles, error: profilesErr },
      { data: appointments, error: apptsErr },
      { data: trainerProfiles },
      { data: allTokens },
      { data: schedules },
      { data: monthlyCounts },
    ] = await Promise.all([
      ProfileService.fetchAllCustomers(),
      AppointmentService.fetchAllDesc(),
      ProfileService.fetchTrainers(),
      TokenService.fetchAllActive(),
      TrainerScheduleService.fetchAll(),
      supabase.rpc('get_trainer_monthly_counts'),
    ]);
    if (profilesErr || apptsErr) {
      setLoadError(profilesErr?.message ?? apptsErr?.message ?? 'Fehler beim Laden.');
    }
    setCustomers((profiles ?? []) as CustomerProfile[]);
    setAllAppointments(((appointments ?? []) as AdminAppointment[]).map(fmtTime));
    setTrainers((trainerProfiles ?? []) as TrainerProfile[]);
    setTrainerSchedules(((schedules ?? []) as TrainerSchedule[]).map(fmtTime));

    const tokenMap: Record<string, { individual: number; gruppe: number }> = {};
    for (const token of (allTokens ?? []) as { user_id: string; category: string }[]) {
      if (!tokenMap[token.user_id]) tokenMap[token.user_id] = { individual: 0, gruppe: 0 };
      if (token.category === 'individual') tokenMap[token.user_id].individual++;
      else if (token.category === 'gruppe') tokenMap[token.user_id].gruppe++;
    }
    setActiveTokensByCustomer(tokenMap);

    const countsMap: Record<string, Record<string, number>> = {};
    for (const row of (monthlyCounts ?? []) as { trainer_id: string; year_month: string; sessions: number }[]) {
      if (!countsMap[row.trainer_id]) countsMap[row.trainer_id] = {};
      countsMap[row.trainer_id][row.year_month] = row.sessions;
    }
    setTrainerMonthlyCounts(countsMap);

    setLoading(false);
  };

  const cancelAppointment = async (id: string, reason?: string) => {
    const { data, error } = await supabase.rpc('cancel_and_issue_token', { p_appointment_id: id, p_skip_token: false });
    if (error) return { error };
    const result = data as { error?: string; token?: unknown } | null;
    if (result?.error) return { error: { message: result.error } };

    // Kunde per E-Mail über die Admin-Stornierung informieren (fire-and-forget;
    // ein Mail-Fehler darf die erfolgreiche Stornierung nicht zurückrollen).
    try {
      const { error: mailError } = await supabase.functions.invoke('send-admin-cancellation-email', {
        body: { appointmentId: id, reason: reason?.trim() || undefined },
      });
      if (mailError) console.warn('Storno-Mail fehlgeschlagen:', mailError.message);
    } catch (e) {
      console.warn('Storno-Mail nicht erreichbar:', e);
    }

    const appt = allAppointments.find(a => a.id === id);
    if (appt) {
      const category = PROGRAM_CATEGORY[appt.program as ProgramId] ?? 'individual';
      setAllAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' as const } : a));
      // Nachholtermin-Storno durch den Admin stellt keinen neuen Token aus
      // (Server liefert dann kein token-Feld) — Zähler nur bei echtem Token bumpen.
      if (result?.token) {
        setActiveTokensByCustomer(prev => ({
          ...prev,
          [appt.user_id]: {
            individual: (prev[appt.user_id]?.individual ?? 0) + (category === 'individual' ? 1 : 0),
            gruppe: (prev[appt.user_id]?.gruppe ?? 0) + (category === 'gruppe' ? 1 : 0),
          },
        }));
      }
    }
    return { error: null };
  };

  // Reine Validierung eines einzelnen Termins — alle Buchungsregeln, kein INSERT.
  // Wird sowohl von der Einzel- als auch der Serien-Buchung genutzt.
  const validateBooking = async (
    userId: string, date: string, time: string, program: string,
    trainerId?: string | null, forceSkipCompat = false,
  ): Promise<{ error: { message: string } | null }> => {
    // No bookings in the past — neither past days nor past times today. The
    // time guard also catches the default slot staying selected after its chip
    // was disabled (e.g. 13:00 still set when it is already afternoon).
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (date < today) {
      return { error: { message: 'Datum darf nicht in der Vergangenheit liegen.' } };
    }
    if (date === today && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`) {
      return { error: { message: 'Diese Uhrzeit liegt bereits in der Vergangenheit.' } };
    }

    const { data: conflicts } = await AppointmentService.checkDailyConflict(userId, date);
    if (conflicts && conflicts.length >= 2) {
      return { error: { message: 'Der Kunde hat an diesem Tag bereits zwei Termine.' } };
    }
    if (conflicts && conflicts.some((c: { time: string }) => c.time.slice(0, 5) === time)) {
      return { error: { message: 'Der Kunde hat an diesem Tag zur gleichen Uhrzeit bereits einen Termin.' } };
    }

    const custProfile = customers.find(c => c.id === userId);
    if (custProfile) {
      const permCheck = checkProgramPermission(custProfile, program as ProgramId);
      if (!permCheck.allowed) {
        return { error: { message: permCheck.reason ?? 'Kunde hat keine Berechtigung für dieses Programm.' } };
      }
    }

    // Trainerzeiten-Check
    if (trainerId) {
      const jsDay = new Date(date + 'T12:00:00').getDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;
      const trainerHasSlot = trainerSchedules.some(
        s => s.trainer_id === trainerId && s.day_of_week === dayOfWeek && s.time === time,
      );
      if (!trainerHasSlot) {
        const trainerName = trainers.find(t => t.id === trainerId)?.full_name ?? 'Trainer';
        return { error: { message: `${trainerName} hat zu dieser Zeit keinen Unterricht eingeplant.` } };
      }
    }

    if (trainerId) {
      const trainer = trainers.find(t => t.id === trainerId);
      if (trainer?.trainer_specialty === 'spieler') {
        const slotBookings = allAppointments.filter(
          a => a.trainer_id === trainerId && a.date === date && a.time === time && a.status === 'confirmed',
        );
        if (slotBookings.length > 0) {
          const newCat = PROGRAM_CATEGORY[program as ProgramId] ?? 'individual';
          const existCat = PROGRAM_CATEGORY[slotBookings[0].program as ProgramId] ?? 'individual';
          if (newCat !== existCat) {
            return { error: { message: `Trainer hat in diesem Slot bereits ${existCat === 'individual' ? 'Individual' : 'Gruppen'}training.` } };
          }
        }
      }
    }

    const customer = customers.find(c => c.id === userId);
    const birthYear = customer?.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;
    const level = customer?.level ?? null;

    // Alters-/Level-Kompatibilität kann pro Spieler (Profil-Flag) oder pro
    // Buchung (forceSkipCompat) durch den Admin übergangen werden. Nur DIESER
    // Check entfällt dann — Kapazität, Tageslimit etc. bleiben aktiv.
    const exemptCompat = forceSkipCompat || custProfile?.skip_group_age_level_check === true;
    if (PROGRAM_CATEGORY[program as ProgramId] === 'gruppe' && birthYear && level && !exemptCompat) {
      // Ein Trainer = eine Gruppe (Kapazität 4, ein Programm pro Trainer/Slot).
      // Daher nur gegen die Spieler DESSELBEN Trainers auf Kompatibilität prüfen —
      // sonst blockiert die erste Gruppe fälschlich jede weitere Gruppe (anderer
      // Trainer) im selben Slot. Ohne gewählten Trainer fällt es auf slot-weit zurück.
      const slotAppts = allAppointments.filter(
        a => a.date === date && a.time === time && a.program === program && a.status === 'confirmed'
          && (trainerId ? a.trainer_id === trainerId : true),
      );
      const existingPlayers = slotAppts
        .filter(a => a.session_birth_year != null && a.session_level)
        .map(a => ({ birthYear: a.session_birth_year!, level: a.session_level as PlayerLevel }));
      if (existingPlayers.length > 0) {
        const check = canJoinGroupSlot(
          { birthYear, level }, existingPlayers, parseInt(date.slice(0, 4)),
        );
        if (!check.allowed) return { error: { message: check.reason ?? 'Gruppe nicht kompatibel.' } };
      }
    }

    return { error: null };
  };

  // Reiner INSERT (ohne Validierung) — Standort + Spielerdaten leitet er aus
  // Trainer-Slot und Kundenprofil ab. Gibt die eingefügte Zeile zurück.
  const insertBooking = async (
    userId: string, date: string, time: string, program: string,
    trainerId?: string | null,
  ) => {
    const customer = customers.find(c => c.id === userId);
    const birthYear = customer?.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;
    const level = customer?.level ?? null;

    // Standort folgt dem gewählten Trainer-Slot (location des Zeitplan-Eintrags).
    const jsDayLoc = new Date(date + 'T12:00:00').getDay();
    const dowLoc = jsDayLoc === 0 ? 7 : jsDayLoc;
    const slotLocation = trainerId
      ? (trainerSchedules.find(s => s.trainer_id === trainerId && s.day_of_week === dowLoc && s.time === time)?.location ?? null)
      : null;

    return AppointmentService.insert({
      user_id: userId, date, time, status: 'confirmed', program,
      ...(trainerId ? { trainer_id: trainerId } : {}),
      ...(birthYear ? { session_birth_year: birthYear } : {}),
      ...(level ? { session_level: level } : {}),
      ...(slotLocation ? { location: slotLocation } : {}),
    });
  };

  const addAppointmentForCustomer = async (
    userId: string, date: string, time: string, program: string,
    trainerId?: string | null, skipGroupCompat = false,
  ) => {
    const { error: vErr } = await validateBooking(userId, date, time, program, trainerId, skipGroupCompat);
    if (vErr) return { error: vErr };

    const { data, error } = await insertBooking(userId, date, time, program, trainerId);
    if (data && !error) {
      setAllAppointments(prev => [...prev, fmtTime(data as AdminAppointment)]);
    }
    return { error };
  };

  // Serien-Buchung („alles oder nichts"): erst werden ALLE Termine validiert.
  // Scheitert auch nur einer, wird nichts gebucht und die Konfliktliste
  // zurückgegeben. Sind alle sauber, werden sie eingefügt; bricht ein INSERT
  // wider Erwarten ab (z. B. DB-Kapazitäts-Trigger), werden die bereits
  // eingefügten Termine wieder gelöscht (Rollback) — kein Teil-Ergebnis.
  const addRecurringAppointments = async (
    userId: string, dates: string[], time: string, program: string,
    trainerId?: string | null, skipGroupCompat = false,
  ): Promise<{ error: { message: string } | null; conflicts: { date: string; reason: string }[]; created: number }> => {
    if (dates.length === 0) {
      return { error: { message: 'Keine Termine im gewählten Zeitraum.' }, conflicts: [], created: 0 };
    }

    // 1. Vorab alle prüfen.
    const conflicts: { date: string; reason: string }[] = [];
    for (const date of dates) {
      const { error } = await validateBooking(userId, date, time, program, trainerId, skipGroupCompat);
      if (error) conflicts.push({ date, reason: error.message });
    }
    if (conflicts.length > 0) {
      return { error: null, conflicts, created: 0 };
    }

    // 2. Alle einfügen, bei Fehler Rollback der bereits angelegten Termine.
    const inserted: AdminAppointment[] = [];
    for (const date of dates) {
      const { data, error } = await insertBooking(userId, date, time, program, trainerId);
      if (error || !data) {
        for (const a of inserted) {
          await AppointmentService.delete(a.id);
        }
        return {
          error: { message: `Buchung am ${date} fehlgeschlagen (${error?.message ?? 'unbekannt'}). Serie abgebrochen, keine Termine gespeichert.` },
          conflicts: [],
          created: 0,
        };
      }
      inserted.push(fmtTime(data as AdminAppointment));
    }

    setAllAppointments(prev => [...prev, ...inserted]);
    return { error: null, conflicts: [], created: inserted.length };
  };

  const createCustomer = async (
    params: CreateCustomerParams,
  ): Promise<{ error: string | null; tempPassword?: string; customerNumber?: number }> => {
    try {
      const { data, error } = await CustomerService.create(params);
      if (error) {
        return { error: await extractFunctionError(error) };
      }
      if (data?.error) return { error: data.error as string };
      await load();
      return { error: null, tempPassword: data.temp_password, customerNumber: data.customer_number };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  };

  const deleteCustomer = async (customerId: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await CustomerService.delete(customerId);
      if (error) {
        return { error: await extractFunctionError(error) };
      }
      if (data?.error) return { error: data.error as string };
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      setAllAppointments(prev => prev.filter(a => a.user_id !== customerId));
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  };

  const saveCustomerLevel = async (customerId: string, level: PlayerLevel | null) => {
    const { error } = await ProfileService.update(customerId, { level });
    if (!error) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, level } : c));
    return { error };
  };

  const saveBookingPermissions = async (customerId: string, permissions: Partial<BookingPermissions>) => {
    const { error } = await ProfileService.update(customerId, permissions as Record<string, unknown>);
    if (!error) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, ...permissions } : c));
    return { error };
  };

  // Langfristige Befreiung eines Spielers von der Gruppen-Alters-/Level-Prüfung
  // (greift nur im Admin-Buchungspfad; per RLS + Guard-Trigger admin-only).
  const saveGroupCompatExempt = async (customerId: string, value: boolean) => {
    const { error } = await ProfileService.update(customerId, { skip_group_age_level_check: value });
    if (!error) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, skip_group_age_level_check: value } : c));
    return { error };
  };

  const saveCustomerProfile = async (
    customerId: string,
    fields: Partial<Pick<CustomerProfile, 'full_name' | 'player_type' | 'parent_name' | 'location' | 'birth_date' | 'phone' | 'address'>>,
  ) => {
    const { error } = await ProfileService.update(customerId, fields as Record<string, unknown>);
    if (!error) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, ...fields } : c));
    return { error };
  };

  // E-Mail-Änderung muss den Auth-User mitziehen (sonst Login-Desync) — daher
  // über die Edge Function, die mit Service-Role auth.users + profiles aktualisiert.
  const saveCustomerEmail = async (customerId: string, email: string): Promise<{ error: { message: string } | null }> => {
    try {
      const { data, error } = await supabase.functions.invoke('update-customer-email', {
        body: { customerId, email },
      });
      if (error) return { error: { message: await extractFunctionError(error) } };
      if (data?.error) return { error: { message: data.error as string } };
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, email } : c));
      return { error: null };
    } catch (e: any) {
      return { error: { message: e?.message ?? String(e) } };
    }
  };

  // Aktiv/Inaktiv ist reines Label + Filterkriterium — blockiert kein Login/keine Buchung.
  const toggleCustomerActive = async (customerId: string, isActive: boolean) => {
    const { error } = await ProfileService.update(customerId, { is_active: isActive });
    if (!error) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, is_active: isActive } : c));
    return { error };
  };

  // Setzt die aktiven (unbenutzten) Stornierungstokens eines Kunden zurück (Zähler auf 0).
  const resetCustomerTokens = async (customerId: string) => {
    const { error } = await TokenService.deleteActiveForUser(customerId);
    if (!error) {
      setActiveTokensByCustomer(prev => ({ ...prev, [customerId]: { individual: 0, gruppe: 0 } }));
    }
    return { error };
  };

  // location = null entfernt den Slot; ein Standort legt ihn an bzw. ändert
  // den Standort eines bestehenden Slots (ein Standort pro Trainer-Slot).
  // Bei Standort-Wechsel zieht ein DB-Trigger zukünftige Termine mit; danach
  // benachrichtigen wir die betroffenen Kunden per E-Mail.
  const setScheduleSlot = async (
    trainerId: string, day: number, time: string, location: 'Rüsselsheim' | 'Kelsterbach' | null,
  ) => {
    const previous = trainerSchedules.find(
      s => s.trainer_id === trainerId && s.day_of_week === day && s.time === time,
    );
    const previousLocation = previous?.location ?? null;

    if (location === null) {
      const { error } = await TrainerScheduleService.deleteEntry(trainerId, day, time);
      if (!error) {
        setTrainerSchedules(prev =>
          prev.filter(s => !(s.trainer_id === trainerId && s.day_of_week === day && s.time === time)),
        );
      }
      return { error };
    }
    const { data, error } = await TrainerScheduleService.upsert({
      trainer_id: trainerId, day_of_week: day, time, location,
    });
    if (!error && data) {
      const fresh = fmtTime(data as TrainerSchedule);
      setTrainerSchedules(prev => [
        ...prev.filter(s => !(s.trainer_id === trainerId && s.day_of_week === day && s.time === time)),
        fresh,
      ]);
    } else if (!error) {
      await load();
    }

    // Standort-Wechsel auf eine existierende Slot-Zeile: Kunden informieren.
    // Ein frischer Slot (previous == null) kann keine Bestandstermine haben.
    if (!error && previous && previousLocation !== location) {
      supabase.functions
        .invoke('notify-location-change', {
          body: { trainer_id: trainerId, day_of_week: day, time, new_location: location },
        })
        .catch(e => console.warn('notify-location-change fehlgeschlagen:', e));
    }

    return { error };
  };

  const createTrainer = async (params: {
    full_name: string;
    email: string;
    specialty: TrainerSpecialty;
  }): Promise<{ error: string | null; tempPassword?: string }> => {
    try {
      const { data, error } = await CustomerService.create({
        full_name: params.full_name,
        email: params.email,
        phone: '',
        birth_date: '',
        address: '',
        parent_name: '',
        player_type: null,
        location: '',
        role: 'trainer',
        trainer_specialty: params.specialty,
      });
      if (error) {
        return { error: await extractFunctionError(error) };
      }
      if (data?.error) return { error: data.error as string };
      await load();
      return { error: null, tempPassword: data.temp_password };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  };

  const updateTrainer = async (trainerId: string, params: { full_name: string; trainer_specialty: TrainerSpecialty }): Promise<{ error: string | null }> => {
    const { error } = await ProfileService.update(trainerId, params);
    if (!error) {
      setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, ...params } : t));
    }
    return { error: error?.message ?? null };
  };

  const deleteTrainer = async (trainerId: string): Promise<{ error: string | null; cancelledCount?: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-trainer', { body: { trainer_id: trainerId } });
      if (error) return { error: error.message ?? 'Fehler beim Löschen.' };
      if (data?.error) return { error: String(data.error) };
      setTrainers(prev => prev.filter(t => t.id !== trainerId));
      setTrainerSchedules(prev => prev.filter(s => s.trainer_id !== trainerId));
      await load();
      return { error: null, cancelledCount: data?.cancelled_count ?? 0 };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  };

  const markAttended = async (apptId: string, attended: boolean | null) => {
    const { error } = await AppointmentService.updateAttended(apptId, attended);
    if (!error) {
      setAllAppointments(prev => prev.map(a => a.id === apptId ? { ...a, attended } : a));
    }
    return { error };
  };

  return {
    customers, allAppointments, trainers, trainerSchedules, trainerMonthlyCounts, activeTokensByCustomer, loading, loadError,
    cancelAppointment, addAppointmentForCustomer, addRecurringAppointments,
    createCustomer, deleteCustomer,
    saveCustomerLevel, saveBookingPermissions, saveCustomerProfile, saveGroupCompatExempt,
    saveCustomerEmail, toggleCustomerActive, resetCustomerTokens,
    setScheduleSlot, createTrainer, updateTrainer, deleteTrainer,
    markAttended,
    reload: load,
  };
}

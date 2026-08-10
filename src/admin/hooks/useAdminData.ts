import { useState, useEffect, useCallback } from 'react';
import { PlayerLevel, PlayerType, BookingPermissions, TrainerSchedule, TrainerSpecialty, Location } from '../../types';
import { AppointmentService } from '../../services/appointmentService';
import { ProfileService } from '../../services/profileService';
import { PlayerService } from '../../services/playerService';
import { TokenService } from '../../services/tokenService';
import { TrainerScheduleService } from '../../services/trainerScheduleService';
import { CustomerService, CreateCustomerParams, extractFunctionError } from '../services/customerService';
import { fetchAdminData } from '../services/adminDataLoader';
import { validateBooking, insertBooking, bookRecurring, BookingContext } from '../services/adminBookingService';
import { PROGRAM_CATEGORY, ProgramId } from '../../constants/programs';
import { fmtTime, todayStr } from '../../utils/date';
import { supabase } from '../../lib/supabase';

// Im Eltern-/Spieler-Modell ist eine "Kundenzeile" der Admin-UI genau EIN
// Spieler (players-Zeile), angereichert um die Kontaktdaten des Elternteils.
//   id              = players.id  (Schluessel fuer Termine/Tokens/Berechtigungen)
//   full_name       = players.name (Kind)
//   customer_number = players.player_number
//   parent_id       = profiles.id des Elternteils
//   parent_name     = full_name des Elternteils (Kontextzeile)
//   email/phone/address = vom Eltern-Profil
export type CustomerProfile = {
  id: string;
  parent_id: string;
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
  // Stichtag der letzten Einzeltraining-Abrechnung ('YYYY-MM-DD').
  individual_billed_since: string;
} & BookingPermissions;

export type AdminAppointment = {
  id: string;
  player_id: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  program: string;
  trainer_id?: string | null;
  session_level?: string | null;
  session_birth_year?: number | null;
  location?: string | null;
  short_notice_cancel?: boolean | null;
  is_makeup?: boolean | null;
  makeup_count?: number | null;
};

export type TrainerProfile = {
  id: string;
  full_name: string;
  trainer_specialty?: TrainerSpecialty | null;
};

/**
 * Einheitlicher Rückgabewert ALLER Mutationen dieses Hooks:
 * `error === null` = erfolgreich, sonst die fertige deutsche Meldung.
 * Aufrufer müssen dadurch nie mehr `error.message ?? '…'` normalisieren.
 */
export type MutationResult = { error: string | null };

const msg = (e: unknown, fallback: string): string =>
  (e as { message?: string } | null)?.message ?? fallback;

export function useAdminData() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [allAppointments, setAllAppointments] = useState<AdminAppointment[]>([]);
  const [trainers, setTrainers] = useState<TrainerProfile[]>([]);
  const [trainerSchedules, setTrainerSchedules] = useState<TrainerSchedule[]>([]);
  const [trainerMonthlyCounts, setTrainerMonthlyCounts] = useState<Record<string, Record<string, number>>>({});
  const [activeTokensByCustomer, setActiveTokensByCustomer] = useState<Record<string, { individual: number; gruppe: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const snapshot = await fetchAdminData();
      setCustomers(snapshot.customers);
      setAllAppointments(snapshot.appointments);
      setTrainers(snapshot.trainers);
      setTrainerSchedules(snapshot.trainerSchedules);
      setActiveTokensByCustomer(snapshot.tokenCountsByPlayer);
      setTrainerMonthlyCounts(snapshot.trainerMonthlyCounts);
      if (snapshot.error) setLoadError(snapshot.error);
    } catch (e) {
      setLoadError(msg(e, 'Fehler beim Laden.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Kontext für die Buchungslogik (services/adminBookingService).
  const bookingContext = (): BookingContext => ({ customers, allAppointments, trainers, trainerSchedules });

  // ── Termine ───────────────────────────────────────────────────────────────

  const cancelAppointment = async (id: string, reason?: string): Promise<MutationResult> => {
    const { data, error } = await supabase.rpc('cancel_and_issue_token', { p_appointment_id: id, p_skip_token: false });
    if (error) return { error: msg(error, 'Fehler beim Stornieren.') };
    const result = data as { error?: string; token?: unknown } | null;
    if (result?.error) return { error: result.error };

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
          [appt.player_id]: {
            individual: (prev[appt.player_id]?.individual ?? 0) + (category === 'individual' ? 1 : 0),
            gruppe: (prev[appt.player_id]?.gruppe ?? 0) + (category === 'gruppe' ? 1 : 0),
          },
        }));
      }
    }
    return { error: null };
  };

  const addAppointmentForCustomer = async (
    userId: string, date: string, time: string, program: string,
    trainerId?: string | null, skipGroupCompat = false,
  ): Promise<MutationResult> => {
    const req = { playerId: userId, date, time, program, trainerId, skipGroupCompat };
    const ctx = bookingContext();
    const reason = await validateBooking(ctx, req);
    if (reason) return { error: reason };

    const { data, error } = await insertBooking(ctx, req);
    if (error) return { error: msg(error, 'Buchung fehlgeschlagen.') };
    if (data) setAllAppointments(prev => [...prev, fmtTime(data as AdminAppointment)]);
    return { error: null };
  };

  const addRecurringAppointments = async (
    userId: string, dates: string[], time: string, program: string,
    trainerId?: string | null, skipGroupCompat = false,
  ): Promise<{ error: string | null; conflicts: { date: string; reason: string }[]; created: number }> => {
    const result = await bookRecurring(bookingContext(), dates, {
      playerId: userId, time, program, trainerId, skipGroupCompat,
    });
    if (result.created.length > 0) {
      setAllAppointments(prev => [...prev, ...result.created]);
    }
    return { error: result.error, conflicts: result.conflicts, created: result.created.length };
  };

  // "Ist bezahlt": setzt den Abrechnungs-Stichtag der Einzeltrainings auf heute,
  // der 4er-Zähler startet damit wieder bei 0. Reine Merkhilfe — Buchungen und
  // Gutscheine bleiben davon unberührt.
  const markIndividualBilled = async (customerId: string): Promise<MutationResult> => {
    const since = todayStr();
    const { error } = await PlayerService.update(customerId, { individual_billed_since: since });
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, individual_billed_since: since } : c));
    return { error: null };
  };

  // ── Kunden ────────────────────────────────────────────────────────────────

  const createCustomer = async (
    params: CreateCustomerParams,
  ): Promise<{ error: string | null; tempPassword?: string; customerNumber?: number }> => {
    try {
      const { data, error } = await CustomerService.create(params);
      if (error) return { error: await extractFunctionError(error) };
      if (data?.error) return { error: data.error as string };
      await load();
      return { error: null, tempPassword: data.temp_password, customerNumber: data.customer_number };
    } catch (e) {
      return { error: msg(e, String(e)) };
    }
  };

  // Loescht genau diesen Spieler (players-Zeile). Cascade entfernt dessen Termine
  // + Tokens; Eltern-Account und Geschwister bleiben bestehen (kein Auth-Delete).
  const deleteCustomer = async (customerId: string): Promise<MutationResult> => {
    try {
      const parentId = customers.find(c => c.id === customerId)?.parent_id ?? null;
      const { error } = await PlayerService.remove(customerId);
      if (error) return { error: msg(error, 'Fehler beim Löschen.') };
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      setAllAppointments(prev => prev.filter(a => a.player_id !== customerId));

      // War das der letzte Spieler dieses Elternteils? Dann den verwaisten
      // (kinderlosen) Eltern-Account gleich mit entfernen, damit kein toter
      // Login zurueckbleibt. Best effort: der Spieler ist bereits geloescht,
      // ein Fehler hier darf das Gesamtergebnis nicht kippen.
      if (parentId) {
        const siblingsLeft = customers.filter(c => c.parent_id === parentId && c.id !== customerId).length;
        if (siblingsLeft === 0) {
          try {
            await supabase.functions.invoke('delete-customer', { body: { customerId: parentId } });
          } catch (e) {
            console.warn('Verwaisten Eltern-Account konnte nicht entfernt werden:', e);
          }
        }
      }
      return { error: null };
    } catch (e) {
      return { error: msg(e, String(e)) };
    }
  };

  const saveCustomerLevel = async (customerId: string, level: PlayerLevel | null): Promise<MutationResult> => {
    const { error } = await PlayerService.update(customerId, { level });
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, level } : c));
    return { error: null };
  };

  const saveBookingPermissions = async (customerId: string, permissions: Partial<BookingPermissions>): Promise<MutationResult> => {
    const { error } = await PlayerService.update(customerId, permissions as Record<string, unknown>);
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, ...permissions } : c));
    return { error: null };
  };

  // Langfristige Befreiung eines Spielers von der Gruppen-Alters-/Level-Prüfung
  // (greift nur im Admin-Buchungspfad; per RLS admin-only).
  const saveGroupCompatExempt = async (customerId: string, value: boolean): Promise<MutationResult> => {
    const { error } = await PlayerService.update(customerId, { skip_group_age_level_check: value });
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, skip_group_age_level_check: value } : c));
    return { error: null };
  };

  // Spielerfelder gehen auf die players-Zeile, Eltern-Kontakt auf das Eltern-Profil.
  const saveCustomerProfile = async (
    customerId: string,
    fields: Partial<Pick<CustomerProfile, 'full_name' | 'player_type' | 'parent_name' | 'location' | 'birth_date' | 'phone' | 'address'>>,
  ): Promise<MutationResult> => {
    const customer = customers.find(c => c.id === customerId);

    const playerFields: Record<string, unknown> = {};
    if ('full_name' in fields)   playerFields.name = fields.full_name;
    if ('player_type' in fields) playerFields.player_type = fields.player_type;
    if ('location' in fields)    playerFields.location = fields.location;
    if ('birth_date' in fields)  playerFields.birth_date = fields.birth_date;

    const parentFields: Record<string, unknown> = {};
    if ('parent_name' in fields) parentFields.full_name = fields.parent_name;
    if ('phone' in fields)       parentFields.phone = fields.phone;
    if ('address' in fields)     parentFields.address = fields.address;

    if (Object.keys(playerFields).length > 0) {
      const { error } = await PlayerService.update(customerId, playerFields);
      if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    }
    if (Object.keys(parentFields).length > 0 && customer?.parent_id) {
      const { error } = await ProfileService.update(customer.parent_id, parentFields);
      if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    }
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, ...fields } : c));
    return { error: null };
  };

  // E-Mail-Änderung muss den Auth-User mitziehen (sonst Login-Desync) — daher
  // über die Edge Function, die mit Service-Role auth.users + profiles aktualisiert.
  // E-Mail haengt am Eltern-Account: ueber parent_id aktualisieren und bei allen
  // Geschwistern (gleiche parent_id) im lokalen State nachziehen.
  const saveCustomerEmail = async (customerId: string, email: string): Promise<MutationResult> => {
    const customer = customers.find(c => c.id === customerId);
    const parentId = customer?.parent_id ?? customerId;
    try {
      const { data, error } = await supabase.functions.invoke('update-customer-email', {
        body: { customerId: parentId, email },
      });
      if (error) return { error: await extractFunctionError(error) };
      if (data?.error) return { error: data.error as string };
      setCustomers(prev => prev.map(c => c.parent_id === parentId ? { ...c, email } : c));
      return { error: null };
    } catch (e) {
      return { error: msg(e, String(e)) };
    }
  };

  // Aktiv/Inaktiv des Spielers (players.is_active). Reines Label + Filterkriterium.
  const toggleCustomerActive = async (customerId: string, isActive: boolean): Promise<MutationResult> => {
    const { error } = await PlayerService.setActive(customerId, isActive);
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, is_active: isActive } : c));
    return { error: null };
  };

  // ── Tokens ────────────────────────────────────────────────────────────────

  // Setzt die aktiven (unbenutzten) Stornierungstokens eines Spielers zurück (Zähler auf 0).
  const resetCustomerTokens = async (customerId: string): Promise<MutationResult> => {
    const { error } = await TokenService.deleteActiveForPlayer(customerId);
    if (error) return { error: msg(error, 'Fehler beim Zurücksetzen.') };
    setActiveTokensByCustomer(prev => ({ ...prev, [customerId]: { individual: 0, gruppe: 0 } }));
    return { error: null };
  };

  // Vergibt einem Spieler manuell einen Nachhol-Gutschein (Token) mit gewähltem
  // Ablaufdatum. expiresDate = 'YYYY-MM-DD' -> gültig bis Ende dieses Tages.
  const grantCustomerToken = async (
    customerId: string, category: 'individual' | 'gruppe', expiresDate: string,
  ): Promise<MutationResult> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresDate)) {
      return { error: 'Ablaufdatum im Format YYYY-MM-DD angeben.' };
    }
    // Bis Tagesende (lokal), damit der gewählte Tag noch voll nutzbar ist.
    const expires_at = new Date(`${expiresDate}T23:59:59`).toISOString();
    if (isNaN(new Date(expires_at).getTime())) {
      return { error: 'Ungültiges Ablaufdatum.' };
    }
    const { error } = await TokenService.grant({ player_id: customerId, category, expires_at });
    if (error) return { error: msg(error, 'Fehler beim Vergeben.') };
    setActiveTokensByCustomer(prev => {
      const cur = prev[customerId] ?? { individual: 0, gruppe: 0 };
      return { ...prev, [customerId]: { ...cur, [category]: cur[category] + 1 } };
    });
    return { error: null };
  };

  // ── Trainer & Zeitplan ────────────────────────────────────────────────────

  // location = null entfernt den Slot; ein Standort legt ihn an bzw. ändert
  // den Standort eines bestehenden Slots (ein Standort pro Trainer-Slot).
  // Bei Standort-Wechsel zieht ein DB-Trigger zukünftige Termine mit; danach
  // benachrichtigen wir die betroffenen Kunden per E-Mail.
  const setScheduleSlot = async (
    trainerId: string, day: number, time: string, location: Location | null,
  ): Promise<MutationResult> => {
    const previous = trainerSchedules.find(
      s => s.trainer_id === trainerId && s.day_of_week === day && s.time === time,
    );
    const previousLocation = previous?.location ?? null;

    if (location === null) {
      const { error } = await TrainerScheduleService.deleteEntry(trainerId, day, time);
      if (error) return { error: msg(error, 'Fehler beim Speichern.') };
      setTrainerSchedules(prev =>
        prev.filter(s => !(s.trainer_id === trainerId && s.day_of_week === day && s.time === time)),
      );
      return { error: null };
    }

    const { data, error } = await TrainerScheduleService.upsert({
      trainer_id: trainerId, day_of_week: day, time, location,
    });
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    if (data) {
      const fresh = fmtTime(data as TrainerSchedule);
      setTrainerSchedules(prev => [
        ...prev.filter(s => !(s.trainer_id === trainerId && s.day_of_week === day && s.time === time)),
        fresh,
      ]);
    } else {
      await load();
    }

    // Standort-Wechsel auf eine existierende Slot-Zeile: Kunden informieren.
    // Ein frischer Slot (previous == null) kann keine Bestandstermine haben.
    if (previous && previousLocation !== location) {
      supabase.functions
        .invoke('notify-location-change', {
          body: { trainer_id: trainerId, day_of_week: day, time, new_location: location },
        })
        .catch(e => console.warn('notify-location-change fehlgeschlagen:', e));
    }

    return { error: null };
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
      if (error) return { error: await extractFunctionError(error) };
      if (data?.error) return { error: data.error as string };
      await load();
      return { error: null, tempPassword: data.temp_password };
    } catch (e) {
      return { error: msg(e, String(e)) };
    }
  };

  const updateTrainer = async (
    trainerId: string, params: { full_name: string; trainer_specialty: TrainerSpecialty },
  ): Promise<MutationResult> => {
    const { error } = await ProfileService.update(trainerId, params);
    if (error) return { error: msg(error, 'Fehler beim Speichern.') };
    setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, ...params } : t));
    return { error: null };
  };

  const deleteTrainer = async (trainerId: string): Promise<{ error: string | null; cancelledCount?: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-trainer', { body: { trainer_id: trainerId } });
      if (error) return { error: msg(error, 'Fehler beim Löschen.') };
      if (data?.error) return { error: String(data.error) };
      setTrainers(prev => prev.filter(t => t.id !== trainerId));
      setTrainerSchedules(prev => prev.filter(s => s.trainer_id !== trainerId));
      await load();
      return { error: null, cancelledCount: data?.cancelled_count ?? 0 };
    } catch (e) {
      return { error: msg(e, String(e)) };
    }
  };

  return {
    customers, allAppointments, trainers, trainerSchedules, trainerMonthlyCounts, activeTokensByCustomer, loading, loadError,
    cancelAppointment, addAppointmentForCustomer, addRecurringAppointments,
    createCustomer, deleteCustomer,
    saveCustomerLevel, saveBookingPermissions, saveCustomerProfile, saveGroupCompatExempt,
    saveCustomerEmail, toggleCustomerActive, resetCustomerTokens, grantCustomerToken,
    setScheduleSlot, createTrainer, updateTrainer, deleteTrainer,
    markIndividualBilled,
    reload: load,
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, CancellationToken, ProgramCategory, SlotCount, SlotPlayer, Player, Location } from '../types';
import { PROGRAM_CATEGORY, ProgramId } from '../constants/programs';
import { checkDailyConflict, checkProgramPermission } from '../utils/bookingRules';
import { fmtDate } from '../constants/i18n';
import { AppointmentService } from '../services/appointmentService';
import { TokenService } from '../services/tokenService';
import { EmailService } from '../services/emailService';

function getCategory(program: string): ProgramCategory {
  return PROGRAM_CATEGORY[program as ProgramId] ?? 'individual';
}

// PostgREST serializes native time columns as "HH:MM:SS" — normalize to "HH:MM".
const fmtTime = <T extends { time?: string | null }>(a: T): T =>
  ({ ...a, time: a.time ? a.time.slice(0, 5) : a.time });

// Termine/Tokens beziehen sich auf das aktive Kind (activePlayer). Slot-Zaehler
// und Spieler-Infos sind global/anonym und unabhaengig vom aktiven Kind.
export function useAppointments(activePlayer: Player | null) {
  const [slotCounts, setSlotCounts] = useState<SlotCount[]>([]);
  const [slotPlayers, setSlotPlayers] = useState<SlotPlayer[]>([]);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [activeTokens, setActiveTokens] = useState<CancellationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const activePlayerIdRef = useRef<string | null>(null);
  // Track IDs already handled by optimistic updates to prevent Realtime double-counting
  const optimisticallyHandledRef = useRef<Set<string>>(new Set());
  // Same guard for cancellations (UPDATE confirmed→cancelled)
  const optimisticallyHandledCancelRef = useRef<Set<string>>(new Set());

  // --- Globale Slot-Daten + Realtime (unabhaengig vom aktiven Kind) ----------
  useEffect(() => {
    let isMounted = true;

    const loadSlotData = async () => {
      const [countsData, playersData] = await Promise.all([
        AppointmentService.fetchSlotCounts(),
        AppointmentService.fetchSlotPlayers(),
      ]);
      if (!isMounted) return;
      if (countsData.data) setSlotCounts(countsData.data as SlotCount[]);
      if (playersData.data) setSlotPlayers(playersData.data as SlotPlayer[]);
    };

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      const user = session?.user ?? null;
      if (user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        loadSlotData();
      } else if (!user) {
        setSlotCounts([]);
        setSlotPlayers([]);
        setMyAppointments([]);
        setActiveTokens([]);
        setLoading(false);
      }
    });

    const channel = supabase
      .channel(`appointments-live-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' }, (payload) => {
        if (!isMounted) return;
        const appt = fmtTime(payload.new as Appointment);
        if (activePlayerIdRef.current && appt.player_id === activePlayerIdRef.current) {
          setMyAppointments(prev => prev.some(a => a.id === appt.id) ? prev : [...prev, appt]);
        }
        // Skip slot count / player updates if this appointment was already handled
        // by an optimistic update in addAppointment to prevent double-counting
        if (optimisticallyHandledRef.current.has(appt.id)) {
          optimisticallyHandledRef.current.delete(appt.id);
          return;
        }
        if (appt.status === 'confirmed') {
          setSlotCounts(prev => {
            const idx = prev.findIndex(s => s.date === appt.date && s.time === appt.time && s.program === appt.program && (s.location ?? null) === (appt.location ?? null));
            if (idx !== -1) {
              return prev.map((s, i) => i === idx ? { ...s, booked: s.booked + 1 } : s);
            }
            return [...prev, { date: appt.date, time: appt.time, program: appt.program, location: appt.location ?? null, booked: 1 }];
          });
          if (appt.session_birth_year) {
            setSlotPlayers(prev => [...prev, {
              date: appt.date, time: appt.time, program: appt.program,
              location: appt.location ?? null,
              session_birth_year: appt.session_birth_year!,
              session_level: appt.session_level ?? null,
              created_at: appt.created_at ?? new Date().toISOString(),
            }]);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments' }, (payload) => {
        if (!isMounted) return;
        const appt = fmtTime(payload.new as Appointment);
        const old = fmtTime(payload.old as Appointment);
        if (activePlayerIdRef.current && appt.player_id === activePlayerIdRef.current) {
          setMyAppointments(prev => prev.map(a => a.id === appt.id ? appt : a));
        }
        if (old.status === 'confirmed' && appt.status === 'cancelled') {
          if (optimisticallyHandledCancelRef.current.has(appt.id)) {
            optimisticallyHandledCancelRef.current.delete(appt.id);
            return;
          }
          setSlotCounts(prev => prev.map(s =>
            s.date === appt.date && s.time === appt.time && s.program === appt.program && (s.location ?? null) === (appt.location ?? null)
              ? { ...s, booked: Math.max(0, s.booked - 1) } : s
          ));
          if (appt.session_birth_year) {
            setSlotPlayers(prev => {
              const idx = prev.findIndex(p =>
                p.date === appt.date && p.time === appt.time && p.program === appt.program &&
                (p.location ?? null) === (appt.location ?? null) &&
                p.session_birth_year === appt.session_birth_year
              );
              if (idx === -1) return prev;
              return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            });
          }
        } else if (old.status === 'cancelled' && appt.status === 'confirmed') {
          setSlotCounts(prev => {
            const idx = prev.findIndex(s => s.date === appt.date && s.time === appt.time && s.program === appt.program && (s.location ?? null) === (appt.location ?? null));
            if (idx !== -1) return prev.map((s, i) => i === idx ? { ...s, booked: s.booked + 1 } : s);
            return [...prev, { date: appt.date, time: appt.time, program: appt.program, location: appt.location ?? null, booked: 1 }];
          });
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'appointments' }, (payload) => {
        if (!isMounted) return;
        const appt = fmtTime(payload.old as Appointment);
        setMyAppointments(prev => prev.filter(a => a.id !== appt.id));
        if (appt.status === 'confirmed') {
          setSlotCounts(prev => prev.map(s =>
            s.date === appt.date && s.time === appt.time && s.program === appt.program && (s.location ?? null) === (appt.location ?? null)
              ? { ...s, booked: Math.max(0, s.booked - 1) } : s
          ));
          if (appt.session_birth_year) {
            setSlotPlayers(prev => {
              const idx = prev.findIndex(p =>
                p.date === appt.date && p.time === appt.time && p.program === appt.program &&
                (p.location ?? null) === (appt.location ?? null) &&
                p.session_birth_year === appt.session_birth_year
              );
              if (idx === -1) return prev;
              return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            });
          }
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      authSub.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  // --- Termine + Tokens des aktiven Kindes ----------------------------------
  useEffect(() => {
    activePlayerIdRef.current = activePlayer?.id ?? null;
    let isMounted = true;

    if (!activePlayer) {
      // Noch kein aktives Kind (Spieler werden geladen) -> leere Listen, aber
      // loading bleibt aktiv, damit die UI keinen verfruehten Leerzustand zeigt.
      // (Hinweis: `loading` wird aktuell nirgends konsumiert; das Gating laeuft
      //  ueber role===null. Ein kinderloser Account zeigt daher keinen Spinner,
      //  sondern einen leeren Zustand.)
      setMyAppointments([]);
      setActiveTokens([]);
      return;
    }

    setLoading(true);
    (async () => {
      const [apptData, tokenData] = await Promise.all([
        AppointmentService.fetchByPlayer(activePlayer.id),
        TokenService.fetchActive(activePlayer.id),
      ]);
      if (!isMounted) return;
      setMyAppointments(((apptData.data ?? []) as Appointment[]).map(fmtTime));
      setActiveTokens((tokenData.data ?? []) as CancellationToken[]);
      setLoading(false);
    })();

    return () => { isMounted = false; };
  }, [activePlayer?.id]);

  const refreshSlotData = useCallback(async () => {
    const [countsData, playersData] = await Promise.all([
      AppointmentService.fetchSlotCounts(),
      AppointmentService.fetchSlotPlayers(),
    ]);
    if (countsData.data) setSlotCounts(countsData.data as SlotCount[]);
    if (playersData.data) setSlotPlayers(playersData.data as SlotPlayer[]);
  }, []);

  const addAppointment = async (
    date: string, time: string, program: string,
    location: Location | null = null,
  ) => {
    if (!activePlayer) return { error: { message: 'Kein Spieler ausgewählt.' } };

    const category = getCategory(program);
    const activeToken = activeTokens.find(t => t.category === category);
    if (!activeToken) {
      return { error: { message: 'Nachholtermine können nur mit einem gültigen Stornierungstoken gebucht werden.' } };
    }

    // expires_at.slice(0,10) = UTC-Datumsteil = exakt 1 Monat nach dem
    // stornierten Termin (DST-sicher). Tagesgenauer String-Vergleich; new Date(...)
    // + toLocaleDateString würde in Berlin auf den Folgetag verschieben.
    const maxDateStr = activeToken.expires_at.slice(0, 10);
    if (date > maxDateStr) {
      return { error: { message: `Nachholtermin muss bis ${fmtDate(maxDateStr)} gebucht werden.` } };
    }

    const permCheck = checkProgramPermission(activePlayer, program as ProgramId);
    if (!permCheck.allowed) return { error: { message: permCheck.reason! } };

    const dailyConflict = checkDailyConflict(
      myAppointments.filter(a => a.status === 'confirmed'), date, time,
    );
    if (!dailyConflict.allowed) return { error: { message: dailyConflict.reason! } };

    const { data, error } = await supabase.rpc('book_with_token', {
      p_player_id: activePlayer.id,
      p_token_id: activeToken.id,
      p_date: date,
      p_time: time,
      p_program: program,
      p_location: location,
    });

    if (error) return { error };
    const result = data as { appointment?: Appointment; error?: string } | null;
    if (result?.error) return { error: { message: result.error } };

    const newAppt = result?.appointment as Appointment;
    if (newAppt) {
      // Register this ID so the Realtime INSERT handler skips double-counting
      optimisticallyHandledRef.current.add(newAppt.id);
      setMyAppointments(prev => prev.some(a => a.id === newAppt.id) ? prev : [...prev, newAppt]);
      setSlotCounts(prev => {
        const idx = prev.findIndex(s => s.date === date && s.time === time && s.program === program && (s.location ?? null) === (location ?? null));
        if (idx !== -1) return prev.map((s, i) => i === idx ? { ...s, booked: s.booked + 1 } : s);
        return [...prev, { date, time, program, location: location ?? null, booked: 1 }];
      });
      if (newAppt.session_birth_year) {
        setSlotPlayers(prev => [...prev, {
          date, time, program,
          location: location ?? null,
          session_birth_year: newAppt.session_birth_year!,
          session_level: newAppt.session_level ?? null,
          created_at: newAppt.created_at ?? new Date().toISOString(),
        }]);
      }
    }
    setActiveTokens(prev => prev.filter(t => t.id !== activeToken.id));

    EmailService.sendBooking({
      name: activePlayer.name ?? '',
      date, time, program, location: location ?? undefined,
    });

    return { error: null };
  };

  const cancelAppointment = async (id: string, skipToken = false) => {
    const appt = myAppointments.find(a => a.id === id);

    const { data, error } = await supabase.rpc('cancel_and_issue_token', {
      p_appointment_id: id,
      p_skip_token: skipToken,
    });

    if (error) return { error };
    const result = data as { token?: CancellationToken; error?: string } | null;
    if (result?.error) return { error: { message: result.error } };

    setMyAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' as const } : a));

    if (appt) {
      // Register before optimistic update so Realtime UPDATE handler skips double-decrement
      optimisticallyHandledCancelRef.current.add(id);
      setSlotCounts(prev => prev.map(s =>
        s.date === appt.date && s.time === appt.time && s.program === appt.program && (s.location ?? null) === (appt.location ?? null)
          ? { ...s, booked: Math.max(0, s.booked - 1) } : s
      ));
      if (appt.session_birth_year) {
        setSlotPlayers(prev => {
          const idx = prev.findIndex(p =>
            p.date === appt.date && p.time === appt.time && p.program === appt.program &&
            p.session_birth_year === appt.session_birth_year
          );
          if (idx === -1) return prev;
          return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
      }
    }

    const newToken = result?.token as CancellationToken | undefined;
    if (newToken && !skipToken) setActiveTokens(prev => [...prev, newToken]);

    if (appt) {
      EmailService.sendCancellation({
        name: activePlayer?.name ?? '',
        date: appt.date, time: appt.time, program: appt.program,
        location: appt.location ?? undefined,
      });
    }

    return { error: null };
  };

  return { slotCounts, slotPlayers, myAppointments, activeTokens, loading, addAppointment, cancelAppointment, refreshSlotData };
}

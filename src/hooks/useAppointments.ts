import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, CancellationToken, ProgramCategory, SlotCount, SlotPlayer } from '../types';
import { PROGRAM_CATEGORY, ProgramId } from '../constants/programs';
import { checkDailyConflict, checkProgramPermission } from '../utils/bookingRules';
import { Profile } from './useProfile';
import { AppointmentService } from '../services/appointmentService';
import { TokenService } from '../services/tokenService';
import { EmailService } from '../services/emailService';

function getCategory(program: string): ProgramCategory {
  return PROGRAM_CATEGORY[program as ProgramId] ?? 'individual';
}

// PostgREST serializes native time columns as "HH:MM:SS" — normalize to "HH:MM".
const fmtTime = <T extends { time?: string | null }>(a: T): T =>
  ({ ...a, time: a.time ? a.time.slice(0, 5) : a.time });

export function useAppointments(profile: Profile | null) {
  const [slotCounts, setSlotCounts] = useState<SlotCount[]>([]);
  const [slotPlayers, setSlotPlayers] = useState<SlotPlayer[]>([]);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [activeTokens, setActiveTokens] = useState<CancellationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  // Track IDs already handled by optimistic updates to prevent Realtime double-counting
  const optimisticallyHandledRef = useRef<Set<string>>(new Set());
  // Same guard for cancellations (UPDATE confirmed→cancelled)
  const optimisticallyHandledCancelRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    const loadData = async (uid: string) => {
      const [countsData, playersData, allData, tokenData] = await Promise.all([
        AppointmentService.fetchSlotCounts(),
        AppointmentService.fetchSlotPlayers(),
        AppointmentService.fetchAll(),
        TokenService.fetchActive(uid),
      ]);
      if (!isMounted) return;
      if (countsData.data) setSlotCounts(countsData.data as SlotCount[]);
      if (playersData.data) setSlotPlayers(playersData.data as SlotPlayer[]);
      if (allData.data) setMyAppointments((allData.data as Appointment[]).map(fmtTime));
      setActiveTokens((tokenData.data ?? []) as CancellationToken[]);
      setLoading(false);
    };

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      const user = session?.user ?? null;
      if (user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        setUserId(user.id);
        userIdRef.current = user.id;
        loadData(user.id);
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
        if (userIdRef.current && appt.user_id === userIdRef.current) {
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
        setMyAppointments(prev => prev.map(a => a.id === appt.id ? appt : a));
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
    location: 'Rüsselsheim' | 'Kelsterbach' | null = null,
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return { error: { message: 'Nicht eingeloggt.' } };

    const category = getCategory(program);
    const activeToken = activeTokens.find(t => t.category === category);
    if (!activeToken) {
      return { error: { message: 'Nachholtermine können nur mit einem gültigen Stornierungstoken gebucht werden.' } };
    }

    // Use the token's own expires_at (set by the DB: one month after the
    // cancelled appointment's date) rather than recalculating here.
    const maxDate = new Date(activeToken.expires_at);
    if (new Date(date + 'T12:00:00') > maxDate) {
      return { error: { message: `Nachholtermin muss bis ${maxDate.toLocaleDateString('de-DE')} gebucht werden.` } };
    }

    if (profile) {
      const permCheck = checkProgramPermission(profile, program as ProgramId);
      if (!permCheck.allowed) return { error: { message: permCheck.reason! } };
    }

    const dailyConflict = checkDailyConflict(
      myAppointments.filter(a => a.status === 'confirmed'), date, time,
    );
    if (!dailyConflict.allowed) return { error: { message: dailyConflict.reason! } };

    const { data, error } = await supabase.rpc('book_with_token', {
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
      name: profile?.full_name ?? '',
      date, time, program, location: location ?? undefined,
    });

    return { error: null };
  };

  const cancelAppointment = async (id: string, skipToken = false) => {
    const appt = myAppointments.find(a => a.id === id);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

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

    if (appt && user) {
      EmailService.sendCancellation({
        name: profile?.full_name ?? '',
        date: appt.date, time: appt.time, program: appt.program,
      });
    }

    return { error: null };
  };

  return { slotCounts, slotPlayers, myAppointments, activeTokens, loading, addAppointment, cancelAppointment, userId, refreshSlotData };
}

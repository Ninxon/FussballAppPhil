import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrainerSchedule, TrainerSpecialty } from '../types';
import { fmtTime } from '../utils/date';

export type TrainerWithSpecialty = {
  id: string;
  full_name: string;
  trainer_specialty?: TrainerSpecialty | null;
};

export function useTrainerSchedules() {
  const [trainerSchedules, setTrainerSchedules] = useState<TrainerSchedule[]>([]);
  const [trainers, setTrainers] = useState<TrainerWithSpecialty[]>([]);

  useEffect(() => {
    let isMounted = true;

    const load = () => Promise.all([
      supabase.from('trainer_schedules').select('*'),
      supabase
        .from('profiles')
        .select('id, full_name, trainer_specialty')
        .eq('role', 'trainer')
        .order('full_name'),
    ]).then(([s, t]) => {
      if (!isMounted) return;
      if (s.data) setTrainerSchedules((s.data as TrainerSchedule[]).map(fmtTime));
      if (t.data) setTrainers(t.data as TrainerWithSpecialty[]);
    });

    // Load only once an authenticated session exists. The trainer_schedules and
    // trainer-profile RLS policies are restricted to the `authenticated` role,
    // so a query fired on mount before the session is restored runs as `anon`
    // and silently returns nothing — leaving the booking screen with no slots.
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        load();
      }
    });

    const channel = supabase
      .channel(`trainer-schedules-live-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trainer_schedules' }, load)
      .subscribe();

    return () => {
      isMounted = false;
      authSub.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  return { trainerSchedules, trainers };
}

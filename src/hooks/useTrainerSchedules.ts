import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrainerSchedule, TrainerSpecialty } from '../types';

export type TrainerWithSpecialty = {
  id: string;
  full_name: string;
  trainer_specialty?: TrainerSpecialty | null;
};

// PostgREST serializes native time columns as "HH:MM:SS" — normalize to "HH:MM".
const fmtTime = <T extends { time?: string | null }>(a: T): T =>
  ({ ...a, time: a.time ? a.time.slice(0, 5) : a.time });

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

    load();

    const channel = supabase
      .channel(`trainer-schedules-live-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trainer_schedules' }, load)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { trainerSchedules, trainers };
}

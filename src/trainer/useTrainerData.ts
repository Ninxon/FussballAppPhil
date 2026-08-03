import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { todayStr } from '../utils/date';
import { TrainerAppointment, TrainerProfile, TrainerVideoPackage } from './types';

// Laedt Profil, bevorstehende Termine und Video-Pakete des eingeloggten
// Trainers. Welche Pakete er sieht, entscheidet die RLS-Policy anhand der
// Zuweisung — ein Filter auf trainer_id ist daher nicht noetig.
export function useTrainerData() {
  const [appointments, setAppointments] = useState<TrainerAppointment[]>([]);
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [packages, setPackages] = useState<TrainerVideoPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Ohne Session gibt es nichts zu laden — frueher blieb loading hier
      // haengen und der Trainer sah dauerhaft einen Spinner.
      if (!user) {
        setError('Sitzung abgelaufen. Bitte neu anmelden.');
        return;
      }

      const [{ data: prof, error: profErr }, { data: appts, error: apptErr }, { data: vids, error: vidErr }] = await Promise.all([
        supabase.from('profiles').select('full_name, email, trainer_specialty').eq('id', user.id).single(),
        supabase.from('appointments')
          .select('id, date, time, status, program, player_id, location, players ( name, level, player_type )')
          .eq('trainer_id', user.id)
          .eq('status', 'confirmed')
          .gte('date', todayStr())
          .order('date')
          .order('time'),
        supabase.from('video_packages')
          .select(`
            id, title, description, created_at,
            video_package_items ( position, videos ( id, title, description, url, storage_path, size_bytes ) )
          `)
          .order('created_at', { ascending: false }),
      ]);

      const firstError = profErr ?? apptErr ?? vidErr;
      if (firstError) setError(firstError.message ?? 'Daten konnten nicht geladen werden.');

      setProfile((prof as TrainerProfile) ?? null);
      // Normalize time: PostgREST serializes native time type as "HH:MM:SS".
      // PostgREST liefert die eingebettete to-one-Relation als Objekt; der
      // generierte Typ sieht sie als Array, daher der Cast über unknown.
      setAppointments(((appts ?? []) as unknown as TrainerAppointment[]).map(a => ({ ...a, time: a.time?.slice(0, 5) ?? a.time })));

      // Verschachtelte Antwort flach ziehen und die Videos nach position sortieren.
      setPackages(((vids ?? []) as any[]).map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        created_at: p.created_at,
        videos: (p.video_package_items ?? [])
          .slice()
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((i: any) => i.videos)
          .filter(Boolean),
      })));
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { appointments, profile, packages, loading, error, reload: load };
}

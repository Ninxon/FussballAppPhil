import { supabase } from '../lib/supabase';

const SELECT = 'id, date, time, status, program, player_id, trainer_id, session_birth_year, session_level, attended, is_makeup, makeup_count, location, created_at';

export type AppointmentInsert = {
  player_id: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  program: string;
  trainer_id?: string | null;
  session_birth_year?: number | null;
  session_level?: string | null;
  location?: string | null;
};

export const AppointmentService = {
  fetchAll: () =>
    supabase.from('appointments').select(SELECT).order('date', { ascending: true }),

  // Termine genau eines Spielers (RLS deckt nur eigene Kinder ab; der Filter
  // grenzt zusaetzlich auf das aktive Kind ein).
  fetchByPlayer: (playerId: string) =>
    supabase
      .from('appointments')
      .select(SELECT)
      .eq('player_id', playerId)
      .order('date', { ascending: true }),

  // Admin lädt ALLE Termine über alle Kunden. PostgREST/Supabase deckelt ein
  // SELECT standardmäßig bei 1000 Zeilen — ohne Paging fielen ab dem 1001.
  // Termin die frühesten (ältesten) Daten aus der absteigend sortierten Liste,
  // obwohl sie in der DB stehen (Symptom: der erste Termin einer Serie war
  // optimistisch sichtbar, „verschwand" aber nach Reload). Daher seitenweise
  // laden, bis alle Zeilen geholt sind. Sekundärsortierung nach id, damit das
  // Paging bei gleichem Datum deterministisch bleibt.
  fetchAllDesc: async (): Promise<{ data: any[] | null; error: any }> => {
    const PAGE = 1000;
    const all: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('appointments')
        .select(SELECT)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      if (data && data.length) all.push(...data);
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  insert: (data: AppointmentInsert) =>
    supabase.from('appointments').insert(data).select(SELECT).single(),

  // Hartes Löschen — nur für den Rollback einer fehlgeschlagenen Serien-Buchung
  // (Admin-Kontext; per is_admin()-RLS erlaubt). Normale Stornos laufen über updateStatus.
  delete: (id: string) =>
    supabase.from('appointments').delete().eq('id', id),

  updateStatus: (id: string, status: 'confirmed' | 'cancelled') =>
    supabase.from('appointments').update({ status }).eq('id', id),

  updateAttended: (id: string, attended: boolean | null) =>
    supabase.from('appointments').update({ attended }).eq('id', id),

  checkDailyConflict: (playerId: string, date: string) =>
    supabase
      .from('appointments')
      .select('id, time')
      .eq('player_id', playerId)
      .eq('date', date)
      .eq('status', 'confirmed'),

  fetchSlotCounts: () => supabase.rpc('get_slot_counts'),

  fetchSlotPlayers: () => supabase.rpc('get_slot_players'),
};

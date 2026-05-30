import { supabase } from '../lib/supabase';

const SELECT = 'id, date, time, status, program, user_id, trainer_id, session_birth_year, session_level, attended, is_makeup, makeup_count, location, created_at';

export type AppointmentInsert = {
  user_id: string;
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

  fetchAllDesc: () =>
    supabase.from('appointments').select(SELECT).order('date', { ascending: false }),

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

  checkDailyConflict: (userId: string, date: string) =>
    supabase
      .from('appointments')
      .select('id, time')
      .eq('user_id', userId)
      .eq('date', date)
      .eq('status', 'confirmed'),

  fetchSlotCounts: () => supabase.rpc('get_slot_counts'),

  fetchSlotPlayers: () => supabase.rpc('get_slot_players'),
};

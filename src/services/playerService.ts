import { supabase } from '../lib/supabase';

export type PlayerInsert = {
  parent_id: string;
  name: string;
  birth_date?: string | null;
  player_type?: string | null;
  location?: string | null;
  level?: string | null;
};

export const PlayerService = {
  // Spieler des aktuell eingeloggten Elternteils. RLS filtert auf
  // parent_id = auth.uid(), daher kein expliziter Filter noetig.
  fetchMine: () =>
    supabase.from('players').select('*').order('created_at', { ascending: true }),

  fetchByParent: (parentId: string) =>
    supabase
      .from('players')
      .select('*')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true }),

  // Admin: alle Spieler inkl. Eltern-Kontext (flache Spielerliste).
  fetchAllWithParent: () =>
    supabase
      .from('players')
      .select(
        '*, parent:profiles!players_parent_id_fkey(id, full_name, email, phone, address, customer_number)'
      )
      .order('player_number', { ascending: true }),

  update: (playerId: string, fields: Record<string, unknown>) =>
    supabase.from('players').update(fields).eq('id', playerId),

  setActive: (playerId: string, isActive: boolean) =>
    supabase.from('players').update({ is_active: isActive }).eq('id', playerId),

  // Hartes Loeschen genau eines Spielers (Admin). Cascade entfernt dessen
  // Termine + Tokens; Eltern-Account und Geschwister bleiben unberuehrt.
  remove: (playerId: string) =>
    supabase.from('players').delete().eq('id', playerId),
};

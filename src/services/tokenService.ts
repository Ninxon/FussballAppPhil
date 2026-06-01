import { supabase } from '../lib/supabase';

export type TokenInsert = {
  user_id: string;
  category: string;
  expires_at: string;
  source_appointment_id: string;
};

export const TokenService = {
  fetchActive: (userId: string) =>
    supabase
      .from('cancellation_tokens')
      .select('*')
      .eq('user_id', userId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString()),

  insert: (data: TokenInsert) =>
    supabase.from('cancellation_tokens').insert(data).select('*').single(),

  markUsed: (id: string) =>
    supabase
      .from('cancellation_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id),

  fetchAllActive: () =>
    supabase
      .from('cancellation_tokens')
      .select('user_id, category')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString()),

  // Löscht alle unbenutzten Tokens eines Kunden (Admin-Reset). RLS: nur Admin.
  deleteActiveForUser: (userId: string) =>
    supabase
      .from('cancellation_tokens')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null),
};

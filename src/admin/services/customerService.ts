import { supabase } from '../../lib/supabase';
import { PlayerType, TrainerSpecialty } from '../../types';

export type CreateCustomerParams = {
  email: string;
  full_name: string;
  phone: string;
  birth_date: string;
  address: string;
  parent_name: string;
  player_type: PlayerType | null;
  location: string;
  role?: 'customer' | 'trainer';
  trainer_specialty?: TrainerSpecialty;
  // Modus (b): gesetzt = Geschwister zu bestehendem Elternteil hinzufuegen
  // (kein neuer Auth-User/Passwort, nur eine weitere players-Zeile).
  parent_id?: string;
  level?: string | null;
};

export const CustomerService = {
  create: (params: CreateCustomerParams) =>
    supabase.functions.invoke('create-customer', { body: params }),

  delete: (customerId: string) =>
    supabase.functions.invoke('delete-customer', { body: { customerId } }),
};

// Bei einem non-2xx-Status liefert functions.invoke einen FunctionsHttpError,
// dessen `context` das rohe Response-Objekt ist (NICHT der geparste Body). Die
// vom Server gesendete `{ error: '...' }`-Meldung steht daher erst nach
// `await context.json()` zur Verfügung. Dieser Helfer zieht sie heraus und
// fällt sonst auf die generische Fehlermeldung zurück.
export async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      if (body && typeof body === 'object' && 'error' in body) {
        return String((body as { error: unknown }).error);
      }
    } catch {
      // Body ist kein JSON -> generische Meldung unten
    }
  }
  return (error as { message?: string })?.message ?? JSON.stringify(error);
}

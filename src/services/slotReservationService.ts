import { supabase } from '../lib/supabase';
import { SlotReservationInsert } from '../types';

const SELECT = 'id, player_id, day_of_week, time, location, program, note, created_at';

// Stammplätze ("fester Trainingsplatz"). Schreiben und Lesen der Rohzeilen ist
// per RLS auf den Admin begrenzt — Kunden bekommen ausschliesslich die anonymen
// Zaehler aus get_slot_reservations().
export const SlotReservationService = {
  fetchAll: () =>
    supabase.from('slot_reservations').select(SELECT).order('day_of_week', { ascending: true }),

  create: (row: SlotReservationInsert) =>
    supabase.from('slot_reservations').insert(row).select(SELECT).single(),

  remove: (id: string) =>
    supabase.from('slot_reservations').delete().eq('id', id),

  // Anonyme Sicht fuer den Buchungs-Flow: pro Datum/Uhrzeit/Standort/Spezialitaet
  // wie viele Trainerplaetze fremdreserviert sind (blocked) bzw. den eigenen
  // Kindern gehoeren (mine).
  fetchCounts: () => supabase.rpc('get_slot_reservations'),
};

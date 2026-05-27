-- ============================================================
-- Slot-RPCs um location erweitern (für standort-genaue Auslastung).
-- ============================================================
-- Rückwärtskompatibel: solange Termine location = NULL haben, liefern die
-- Funktionen exakt eine Zeile pro (date,time,program) wie bisher — der alte
-- Client (der die location-Spalte ignoriert) bleibt unberührt. Erst wenn
-- Standorte vergeben werden, entstehen getrennte Zeilen pro Standort.
-- RETURNS TABLE ändert sich → DROP + CREATE nötig.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_slot_counts();
CREATE OR REPLACE FUNCTION public.get_slot_counts()
RETURNS TABLE(date text, "time" text, program text, location text, booked bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT a.date::text, to_char(a.time, 'HH24:MI'), a.program, a.location, COUNT(*)::bigint AS booked
  FROM public.appointments a
  WHERE a.status = 'confirmed'
  GROUP BY a.date, a.time, a.program, a.location;
$$;
COMMENT ON FUNCTION public.get_slot_counts() IS '@omit';
REVOKE EXECUTE ON FUNCTION public.get_slot_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_slot_counts() TO authenticated;

DROP FUNCTION IF EXISTS public.get_slot_players();
CREATE OR REPLACE FUNCTION public.get_slot_players()
RETURNS TABLE(date text, "time" text, program text, location text, session_birth_year int, session_level text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT a.date::text, to_char(a.time, 'HH24:MI'), a.program, a.location, a.session_birth_year, a.session_level, a.created_at
  FROM public.appointments a
  WHERE a.status = 'confirmed'
    AND a.session_birth_year IS NOT NULL;
$$;
COMMENT ON FUNCTION public.get_slot_players() IS '@omit';
REVOKE EXECUTE ON FUNCTION public.get_slot_players() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_slot_players() TO authenticated;

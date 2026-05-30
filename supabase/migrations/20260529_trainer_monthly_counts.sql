-- Trainer-Monats-Counter
-- Aggregiert vergangene, bestätigte Termine pro Trainer und Monat.
-- Wird im Admin-UI (ZeitplanScreen) angezeigt — für Stundenabrechnung / Aktivitätsübersicht.

CREATE OR REPLACE VIEW public.v_trainer_monthly_counts AS
SELECT
  trainer_id,
  to_char(date, 'YYYY-MM') AS year_month,
  COUNT(*)::int AS sessions
FROM public.appointments
WHERE status = 'confirmed'
  AND date < CURRENT_DATE
  AND trainer_id IS NOT NULL
GROUP BY trainer_id, to_char(date, 'YYYY-MM');

-- Admin-Zugriff läuft über diese explizite SECURITY-DEFINER-RPC (is_admin()-Gate),
-- damit das Hook sauber per supabase.rpc(...) lesen kann.
-- ACHTUNG: Eine View vererbt die RLS der Basistabelle NICHT automatisch — sie läuft
-- per Default mit den Rechten des Owners (security_invoker = false) und umgeht damit
-- RLS. Der Direktzugriff auf v_trainer_monthly_counts wird daher in
-- 20260530_fix_trainer_counts_view_rls.sql per security_invoker = on + REVOKE gehärtet.
CREATE OR REPLACE FUNCTION public.get_trainer_monthly_counts()
RETURNS TABLE (trainer_id uuid, year_month text, sessions int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT v.trainer_id, v.year_month, v.sessions
    FROM public.v_trainer_monthly_counts v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trainer_monthly_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trainer_monthly_counts() TO authenticated;

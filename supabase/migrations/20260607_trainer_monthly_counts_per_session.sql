-- ============================================================
-- Trainer-Monatsstatistik: pro Session zählen, nicht pro Kind
-- ============================================================
-- v_trainer_monthly_counts zählte count(*) der vergangenen bestätigten Termine.
-- Bei einer Gruppe sind das mehrere Zeilen (eine pro Kind) -> die Einheit wurde
-- mehrfach gezählt. Ein Trainer hält pro (date, time) genau EINE Session (die
-- trainer_schedules-Unique-Constraint erzwingt einen Standort/Slot pro Zeit).
-- Daher: count(DISTINCT (date, time)) = Anzahl gehaltener Trainings, egal ob
-- Individual oder Gruppe -> ein abgeschlossener Termin zählt 1.
-- ============================================================

CREATE OR REPLACE VIEW public.v_trainer_monthly_counts WITH (security_invoker='on') AS
  SELECT trainer_id,
         to_char(date::timestamp with time zone, 'YYYY-MM'::text) AS year_month,
         count(DISTINCT (date, "time"))::integer AS sessions
  FROM public.appointments
  WHERE status = 'confirmed'
    AND date < CURRENT_DATE
    AND trainer_id IS NOT NULL
  GROUP BY trainer_id, to_char(date::timestamp with time zone, 'YYYY-MM'::text);

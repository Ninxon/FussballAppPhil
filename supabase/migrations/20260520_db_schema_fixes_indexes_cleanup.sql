-- ============================================================
-- Schema-Fixes (2026-05-20)
-- 1. Fehlende Indizes für Trainer-Kapazitätsprüfung
-- 2. Redundanten Index entfernen
-- 3. Alten cancel_and_issue_token 1-Parameter-Overload entfernen
-- 4. Legacy quota-Spalten entfernen
-- ============================================================

-- ── 1a. Composite-Index für Trainer-Kapazitätsprüfung ────────
-- book_with_token + check_slot_capacity fragen beide:
--   WHERE trainer_id = ... AND date = ... AND time = ... AND status = 'confirmed'
-- Partial-Index auf confirmed spart Speicher und hält den Index schlank.
CREATE INDEX IF NOT EXISTS idx_appointments_trainer_date_time
  ON public.appointments(trainer_id, date, "time")
  WHERE status = 'confirmed';

-- ── 1b. Index für Trainer-Suche nach Wochentag + Uhrzeit ─────
-- book_with_token: WHERE day_of_week = v_dow AND time = p_time
-- Bisheriger Index (trainer_id, day_of_week) hilft hier nicht.
CREATE INDEX IF NOT EXISTS idx_trainer_schedules_day_time
  ON public.trainer_schedules(day_of_week, "time");

-- ── 2. Redundanten Index entfernen ───────────────────────────
-- idx_tokens_unique_source (partial unique) deckt diesen vollständig ab.
DROP INDEX IF EXISTS public.idx_tokens_source_appointment_id;

-- ── 3. Alten 1-Parameter-Overload entfernen ──────────────────
-- Die neue Version (p_appointment_id, p_skip_token DEFAULT false) ersetzt ihn.
-- Client übergibt immer p_skip_token explizit.
DROP FUNCTION IF EXISTS public.cancel_and_issue_token(uuid);

-- ── 4. Legacy quota-Spalten entfernen ────────────────────────
-- Wurden durch das Token-System ersetzt, nie mehr gelesen oder geschrieben.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS quota_individual,
  DROP COLUMN IF EXISTS quota_gruppe;

-- ============================================================
-- Migrate date/time columns from text to native PostgreSQL types
-- ============================================================
-- Motivation: native types enforce format, improve query planner
-- stats, and eliminate manual ::date / ::time casts in functions.
--
-- Serialization note:
--   date  → JSON: "YYYY-MM-DD"  (identical to old text format, zero frontend impact)
--   time  → JSON: "HH:MM:SS"    (adds seconds — get_slot_counts / get_slot_players
--                                 are updated to use to_char(...,'HH24:MI') so their
--                                 output stays "HH:MM"; PostgREST row-level queries
--                                 are handled by a normalizer in the hooks)
-- ============================================================

-- ── 0. Drop regex CHECK constraints ─────────────────────────
-- These were guards for the text format. Native types enforce
-- the same guarantee, so the constraints are now redundant.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_date_format_check,
  DROP CONSTRAINT IF EXISTS appointments_time_format_check;

ALTER TABLE public.trainer_schedules
  DROP CONSTRAINT IF EXISTS trainer_schedules_time_check;

-- ── 1. appointments ──────────────────────────────────────────
ALTER TABLE public.appointments
  ALTER COLUMN date     TYPE date USING date::date,
  ALTER COLUMN "time"   TYPE time USING "time"::time;

-- ── 2. profiles.birth_date ───────────────────────────────────
-- Empty strings become NULL (no existing empty strings confirmed by pre-check).
ALTER TABLE public.profiles
  ALTER COLUMN birth_date TYPE date
  USING CASE WHEN birth_date = '' THEN NULL ELSE birth_date::date END;

-- ── 3. trainer_schedules ─────────────────────────────────────
ALTER TABLE public.trainer_schedules
  ALTER COLUMN "time" TYPE time USING "time"::time;

-- ── 4. Drop old book_with_token text-signature ───────────────
-- New function uses native date/time params — different overload signature,
-- so the old (uuid, text, text, text) overload must be dropped first.
DROP FUNCTION IF EXISTS public.book_with_token(uuid, text, text, text);

-- ── 5. get_slot_counts: format time as HH:MI ─────────────────
CREATE OR REPLACE FUNCTION public.get_slot_counts()
  RETURNS TABLE(date text, "time" text, program text, booked bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    a.date::text,
    to_char(a.time, 'HH24:MI'),
    a.program,
    COUNT(*)::bigint AS booked
  FROM public.appointments a
  WHERE a.status = 'confirmed'
  GROUP BY a.date, a.time, a.program;
$$;

-- ── 6. get_slot_players: format time as HH:MI ────────────────
CREATE OR REPLACE FUNCTION public.get_slot_players()
  RETURNS TABLE(
    date             text,
    "time"           text,
    program          text,
    session_birth_year integer,
    session_level    text,
    created_at       timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    a.date::text,
    to_char(a.time, 'HH24:MI'),
    a.program,
    a.session_birth_year,
    a.session_level,
    a.created_at
  FROM public.appointments a
  WHERE a.status = 'confirmed'
    AND a.session_birth_year IS NOT NULL;
$$;

-- ── 7. book_with_token: native param types, no redundant casts ─
-- Parameters changed: p_date text→date, p_time text→time.
-- Internal casts (p_date::date, birth_date::date, p_date::date for ISODOW)
-- are all removed. JSON return uses to_char for time so the client still
-- receives "HH:MM" instead of "HH:MM:SS".
--
-- Note: the old "IF NOW() > issued_at + 28 days" guard is intentionally absent.
-- It was removed in migration 20260520_fix_book_with_token_remove_28day_check.sql
-- because the WHERE clause already enforces expires_at > NOW(), and expires_at is
-- set to issued_at + 1 month (the correct business rule). 28 days was a shorter
-- inconsistent duplicate check, not the intended validity window.
CREATE OR REPLACE FUNCTION public.book_with_token(
  p_token_id  uuid,
  p_date      date,
  p_time      time,
  p_program   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token        public.cancellation_tokens%ROWTYPE;
  v_profile      public.profiles%ROWTYPE;
  v_appt         public.appointments%ROWTYPE;
  v_category     text;
  v_birth_year   int;
  v_trainer_id   uuid;
  v_needed_spec  text;
  v_dow          int;
BEGIN
  SELECT * INTO v_token
  FROM public.cancellation_tokens
  WHERE id        = p_token_id
    AND user_id   = (SELECT auth.uid())
    AND used_at   IS NULL
    AND expires_at > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Token nicht gefunden oder abgelaufen.');
  END IF;

  v_category := CASE p_program
    WHEN 'individual'           THEN 'individual'
    WHEN 'torhueter_individual' THEN 'individual'
    ELSE 'gruppe'
  END;

  IF v_token.category != v_category THEN
    RETURN json_build_object('error', 'Token-Kategorie passt nicht zum gewählten Programm.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = (SELECT auth.uid());

  v_birth_year := CASE
    WHEN v_profile.birth_date IS NOT NULL
    THEN EXTRACT(YEAR FROM v_profile.birth_date)::int
    ELSE NULL
  END;

  v_needed_spec := CASE p_program
    WHEN 'torhueter_individual' THEN 'torwart'
    WHEN 'torhueter_gruppe'     THEN 'torwart'
    ELSE 'spieler'
  END;

  v_dow := EXTRACT(ISODOW FROM p_date)::int;

  SELECT ts.trainer_id INTO v_trainer_id
  FROM public.trainer_schedules ts
  JOIN public.profiles p ON p.id = ts.trainer_id
  WHERE p.role              = 'trainer'
    AND p.trainer_specialty = v_needed_spec
    AND ts.day_of_week      = v_dow
    AND ts."time"           = p_time
    AND CASE
      WHEN v_category = 'individual' THEN
        NOT EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.trainer_id = ts.trainer_id
            AND a.date       = p_date
            AND a."time"     = p_time
            AND a.status     = 'confirmed'
        )
      ELSE
        (
          SELECT COUNT(*) FROM public.appointments a
          WHERE a.trainer_id = ts.trainer_id
            AND a.date       = p_date
            AND a."time"     = p_time
            AND a.status     = 'confirmed'
            AND a.program    = p_program
        ) < 4
        AND NOT EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.trainer_id = ts.trainer_id
            AND a.date       = p_date
            AND a."time"     = p_time
            AND a.status     = 'confirmed'
            AND a.program   != p_program
        )
    END
  ORDER BY (
    SELECT COUNT(*) FROM public.appointments a
    WHERE a.trainer_id = ts.trainer_id
      AND a.date       = p_date
      AND a."time"     = p_time
      AND a.status     = 'confirmed'
      AND a.program    = p_program
  ) DESC
  LIMIT 1;

  INSERT INTO public.appointments
    (user_id, date, "time", status, program, trainer_id, session_birth_year, session_level)
  VALUES (
    (SELECT auth.uid()),
    p_date, p_time, 'confirmed', p_program,
    v_trainer_id,
    v_birth_year,
    v_profile.level
  )
  RETURNING * INTO v_appt;

  UPDATE public.cancellation_tokens SET used_at = NOW() WHERE id = p_token_id;

  -- Build JSON manually so time is formatted as HH:MI (not HH:MI:SS)
  RETURN json_build_object('appointment', json_build_object(
    'id',                 v_appt.id,
    'user_id',            v_appt.user_id,
    'date',               v_appt.date::text,
    'time',               to_char(v_appt.time, 'HH24:MI'),
    'status',             v_appt.status,
    'program',            v_appt.program,
    'trainer_id',         v_appt.trainer_id,
    'session_birth_year', v_appt.session_birth_year,
    'session_level',      v_appt.session_level,
    'attended',           v_appt.attended,
    'created_at',         v_appt.created_at
  ));
END;
$$;

COMMENT ON FUNCTION public.book_with_token(uuid, date, time, text) IS '@omit';
REVOKE EXECUTE ON FUNCTION public.book_with_token(uuid, date, time, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.book_with_token(uuid, date, time, text) TO authenticated;

-- ── 8. check_slot_capacity: remove redundant ::date cast ─────
CREATE OR REPLACE FUNCTION public.check_slot_capacity()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  existing_count   INTEGER;
  max_capacity     INTEGER;
  base_capacity    INTEGER;
  trainer_count    INTEGER;
  needed_specialty TEXT;
  appt_dow         INTEGER;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  base_capacity := CASE NEW.program
    WHEN 'individual'           THEN 1
    WHEN 'torhueter_individual' THEN 1
    WHEN 'gruppe'               THEN 4
    WHEN 'athletik'             THEN 4
    WHEN 'torhueter_gruppe'     THEN 4
    ELSE 1
  END;

  needed_specialty := CASE NEW.program
    WHEN 'torhueter_individual' THEN 'torwart'
    WHEN 'torhueter_gruppe'     THEN 'torwart'
    ELSE 'spieler'
  END;

  -- NEW.date is now native date — no cast needed
  appt_dow := EXTRACT(ISODOW FROM NEW.date)::INTEGER;

  SELECT COUNT(DISTINCT ts.trainer_id) INTO trainer_count
    FROM public.trainer_schedules ts
    JOIN public.profiles p ON p.id = ts.trainer_id AND p.role = 'trainer'
   WHERE p.trainer_specialty = needed_specialty
     AND ts.day_of_week      = appt_dow
     AND ts.time             = NEW.time;

  IF trainer_count = 0 THEN
    trainer_count := 1;
  END IF;

  max_capacity := base_capacity * trainer_count;

  SELECT COUNT(*) INTO existing_count
    FROM public.appointments
   WHERE date    = NEW.date
     AND time    = NEW.time
     AND program = NEW.program
     AND status  = 'confirmed'
     AND id     != NEW.id;

  IF existing_count >= max_capacity THEN
    RAISE EXCEPTION 'Dieser Slot ist bereits ausgebucht.';
  END IF;

  RETURN NEW;
END;
$$;

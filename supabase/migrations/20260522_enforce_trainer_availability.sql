-- ============================================================
-- Enforce trainer availability as a server-side booking invariant
-- ============================================================
-- Context: trainer availability (trainer_schedules) was filtered only
-- in the BuchenScreen UI. The server accepted a booking even when no
-- trainer covered the slot — book_with_token inserted with a NULL
-- trainer_id, and check_slot_capacity fell back to capacity 1. A direct
-- RPC call could therefore create confirmed appointments outside every
-- trainer's schedule. This migration moves the rule onto the server.
--
-- Three changes, all CREATE OR REPLACE (no data touched):
--   1. find_available_trainer()  — single source for the slot→trainer pick
--   2. book_with_token()         — rejects the booking when no trainer is free
--   3. check_slot_capacity()     — only the trainer-less admin override keeps
--                                  the capacity-1 fallback; an assigned-trainer
--                                  booking with zero coverage gets capacity 0
-- ============================================================

-- ── 1. Helper: pick an available trainer for a slot ──────────
-- Extracted verbatim from the previous inline query in book_with_token
-- so the slot→trainer selection lives in exactly one place. Returns the
-- trainer with the most existing bookings in this program (fill groups
-- before opening a second trainer), or NULL when none is free.
CREATE OR REPLACE FUNCTION public.find_available_trainer(
  p_date     date,
  p_time     time,
  p_program  text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ts.trainer_id
  FROM public.trainer_schedules ts
  JOIN public.profiles p ON p.id = ts.trainer_id
  WHERE p.role = 'trainer'
    AND p.trainer_specialty = CASE p_program
      WHEN 'torhueter_individual' THEN 'torwart'
      WHEN 'torhueter_gruppe'     THEN 'torwart'
      ELSE 'spieler'
    END
    AND ts.day_of_week = EXTRACT(ISODOW FROM p_date)::int
    AND ts."time"      = p_time
    AND CASE
      WHEN p_program IN ('individual', 'torhueter_individual') THEN
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
$$;

-- Internal helper only — keep it off the PostgREST RPC surface. Supabase
-- auto-grants EXECUTE on new public functions to anon/authenticated via
-- default privileges, so revoking from PUBLIC alone is not enough.
-- book_with_token is SECURITY DEFINER and owned by the same role, so it can
-- still call this regardless of role grants.
REVOKE EXECUTE ON FUNCTION public.find_available_trainer(date, time, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_available_trainer(date, time, text) FROM anon, authenticated;

-- ── 2. book_with_token: reject booking when no trainer is free ─
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

  v_trainer_id := public.find_available_trainer(p_date, p_time, p_program);

  -- No trainer covers this slot → the UI hides it, but a direct RPC call could
  -- still reach here. Refuse rather than create a trainer-less appointment.
  IF v_trainer_id IS NULL THEN
    RETURN json_build_object('error', 'Für diesen Zeitpunkt ist kein Trainer verfügbar.');
  END IF;

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

-- ── 3. check_slot_capacity: scope the trainer-less fallback ──
-- Previous behaviour reset trainer_count to 1 whenever no trainer was
-- scheduled, which let a coverage-less slot accept a booking. Now the
-- fallback applies ONLY to admin overrides that intentionally insert
-- without a trainer_id (admin books without restrictions). A booking that
-- names a trainer relies on the real scheduled-trainer count; if that is 0
-- the slot has no coverage and max_capacity stays 0, blocking the insert.
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

  appt_dow := EXTRACT(ISODOW FROM NEW.date)::INTEGER;

  SELECT COUNT(DISTINCT ts.trainer_id) INTO trainer_count
    FROM public.trainer_schedules ts
    JOIN public.profiles p ON p.id = ts.trainer_id AND p.role = 'trainer'
   WHERE p.trainer_specialty = needed_specialty
     AND ts.day_of_week      = appt_dow
     AND ts.time             = NEW.time;

  -- Admin override (no trainer assigned) keeps the single-trainer fallback.
  -- An assigned-trainer booking with zero coverage falls through with
  -- trainer_count = 0 → max_capacity = 0 → blocked below.
  IF trainer_count = 0 AND NEW.trainer_id IS NULL THEN
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

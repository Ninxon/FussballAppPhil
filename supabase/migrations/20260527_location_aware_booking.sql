-- ============================================================
-- Standort-genaue Buchung (rückwärtskompatibel).
-- ============================================================
-- Strategie: bestehende Signaturen bleiben als dünne Wrapper erhalten
-- (Standort = NULL = exakt bisheriges Verhalten). Neue, standort-fähige
-- Überladungen mit zusätzlichem p_location-Parameter tragen die Logik.
-- Der aktuell ausgelieferte Frontend-Bundle ruft die 4-arg-Variante von
-- book_with_token auf und läuft damit unverändert weiter.
-- ============================================================

-- ── find_available_trainer: 4-arg-Variante mit Standortfilter ──
CREATE OR REPLACE FUNCTION public.find_available_trainer(
  p_date date, p_time time without time zone, p_program text, p_location text
)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    AND (p_location IS NULL OR ts.location = p_location)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.find_available_trainer(date, time without time zone, text, text) FROM PUBLIC, anon;

-- ── find_available_trainer: 3-arg bleibt als Wrapper (Standort = NULL) ──
CREATE OR REPLACE FUNCTION public.find_available_trainer(
  p_date date, p_time time without time zone, p_program text
)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.find_available_trainer(p_date, p_time, p_program, NULL);
$function$;

-- ── book_with_token: 5-arg-Variante mit Standort ──
CREATE OR REPLACE FUNCTION public.book_with_token(
  p_token_id uuid,
  p_date     date,
  p_time     time without time zone,
  p_program  text,
  p_location text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token        public.cancellation_tokens%ROWTYPE;
  v_profile      public.profiles%ROWTYPE;
  v_appt         public.appointments%ROWTYPE;
  v_category     text;
  v_birth_year   int;
  v_trainer_id   uuid;
BEGIN
  IF p_date < CURRENT_DATE THEN
    RETURN json_build_object('error', 'Das Datum liegt in der Vergangenheit.');
  END IF;

  IF NOT public.is_bookable_day(p_date) THEN
    RETURN json_build_object('error', 'An Wochenenden und Feiertagen sind keine Buchungen möglich.');
  END IF;

  IF p_location IS NOT NULL AND p_location NOT IN ('Rüsselsheim', 'Kelsterbach') THEN
    RETURN json_build_object('error', 'Ungültiger Standort.');
  END IF;

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

  v_trainer_id := public.find_available_trainer(p_date, p_time, p_program, p_location);

  IF v_trainer_id IS NULL THEN
    RETURN json_build_object('error', 'Für diesen Zeitpunkt ist kein Trainer verfügbar.');
  END IF;

  INSERT INTO public.appointments
    (user_id, date, "time", status, program, trainer_id, session_birth_year, session_level,
     is_makeup, makeup_count, location)
  VALUES (
    (SELECT auth.uid()),
    p_date, p_time, 'confirmed', p_program,
    v_trainer_id,
    v_birth_year,
    v_profile.level,
    true,
    v_token.makeup_count,
    p_location
  )
  RETURNING * INTO v_appt;

  UPDATE public.cancellation_tokens SET used_at = NOW() WHERE id = p_token_id;

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
    'is_makeup',          v_appt.is_makeup,
    'makeup_count',       v_appt.makeup_count,
    'location',           v_appt.location,
    'created_at',         v_appt.created_at
  ));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.book_with_token(uuid, date, time without time zone, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_with_token(uuid, date, time without time zone, text, text) TO authenticated;

-- ── book_with_token: 4-arg bleibt als Wrapper (Standort = NULL) ──
CREATE OR REPLACE FUNCTION public.book_with_token(
  p_token_id uuid,
  p_date     date,
  p_time     time without time zone,
  p_program  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN public.book_with_token(p_token_id, p_date, p_time, p_program, NULL);
END;
$function$;

-- ── check_slot_capacity: standort-genau, abwärtskompatibel ──
-- Bei location = NULL exakt wie bisher (alle Trainer/Buchungen am Slot).
-- Bei gesetztem Standort werden Trainer und Auslastung pro Standort gezählt,
-- sodass Rüsselsheim und Kelsterbach unabhängige Kapazitäten haben.
CREATE OR REPLACE FUNCTION public.check_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.date::text || ' ' || NEW.time::text || ' ' || NEW.program || ' ' || COALESCE(NEW.location, ''), 0)
  );

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
     AND ts.time             = NEW.time
     AND (NEW.location IS NULL OR ts.location = NEW.location);

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
     AND id     != NEW.id
     AND location IS NOT DISTINCT FROM NEW.location;

  IF existing_count >= max_capacity THEN
    RAISE EXCEPTION 'Dieser Slot ist bereits ausgebucht.';
  END IF;

  RETURN NEW;
END;
$function$;

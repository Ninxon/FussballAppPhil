-- ============================================================
-- book_with_token server-seitig härten: Wochenende + deutsche
-- Feiertage + Vergangenheit ablehnen.
-- ============================================================
-- Bisher wurden Wochenend-/Feiertagsregeln NUR im Client (bookingRules.ts)
-- geprüft. Ein direkt konstruierter RPC-Aufruf an book_with_token konnte
-- daher an Samstagen, Sonntagen oder Feiertagen buchen. (Off-Grid-Uhrzeiten
-- sind bereits indirekt geblockt: find_available_trainer liefert dann keinen
-- Trainer.) Wir spiegeln die Regeln aus src/utils/bookingRules.ts in die DB.
-- ============================================================

-- Ostersonntag (Gauß'sche Osterformel) — identisch zu easterDate() im Client.
CREATE OR REPLACE FUNCTION public.german_easter(p_year int)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  a int; b int; c int; d int; e int; f int; g int; h int;
  i int; k int; l int; m int; mo int; da int;
BEGIN
  a := p_year % 19;
  b := p_year / 100;
  c := p_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mo := (h + l - 7 * m + 114) / 31;
  da := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_year, mo, da);
END;
$$;

-- Buchbarer Tag = werktags (Mo–Fr) und kein bundesweiter Feiertag.
CREATE OR REPLACE FUNCTION public.is_bookable_day(d date)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  y int := EXTRACT(YEAR FROM d)::int;
  e date := public.german_easter(EXTRACT(YEAR FROM d)::int);
BEGIN
  IF EXTRACT(ISODOW FROM d) IN (6, 7) THEN          -- Samstag/Sonntag
    RETURN false;
  END IF;
  IF d IN (
    make_date(y, 1, 1),    -- Neujahr
    e - 2,                 -- Karfreitag
    e + 1,                 -- Ostermontag
    make_date(y, 5, 1),    -- Tag der Arbeit
    e + 39,                -- Christi Himmelfahrt
    e + 50,                -- Pfingstmontag
    make_date(y, 10, 3),   -- Tag der Deutschen Einheit
    make_date(y, 12, 25),  -- 1. Weihnachtstag
    make_date(y, 12, 26)   -- 2. Weihnachtstag
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- book_with_token mit den neuen Guards (Vergangenheit + Wochenende/Feiertag),
-- ansonsten unverändert zur Version aus 20260526_makeup_cancel_limit.sql.
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

  IF v_trainer_id IS NULL THEN
    RETURN json_build_object('error', 'Für diesen Zeitpunkt ist kein Trainer verfügbar.');
  END IF;

  INSERT INTO public.appointments
    (user_id, date, "time", status, program, trainer_id, session_birth_year, session_level,
     is_makeup, makeup_count)
  VALUES (
    (SELECT auth.uid()),
    p_date, p_time, 'confirmed', p_program,
    v_trainer_id,
    v_birth_year,
    v_profile.level,
    true,
    v_token.makeup_count
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
    'created_at',         v_appt.created_at
  ));
END;
$function$;

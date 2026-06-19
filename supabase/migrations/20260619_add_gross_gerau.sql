-- ============================================================
-- Dritter Standort "Groß-Gerau" zulassen
-- ============================================================
-- Bisher kannte die DB nur 'Rüsselsheim' und 'Kelsterbach'. Die Standort-Liste
-- ist (mangels zentraler Quelle) über drei CHECK-Constraints und die
-- book_with_token-Validierung dupliziert. Diese Migration erweitert alle vier
-- Stellen um 'Groß-Gerau'. Keine Spalten-/Datenänderung — bestehende Zeilen
-- bleiben gültig (das Array wird nur erweitert, nichts entfernt).
-- ============================================================

-- 1) CHECK-Constraints neu setzen (drop + re-add mit 3-Werte-Array) ----------

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_location_chk;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_location_chk
  CHECK ((location IS NULL) OR (location = ANY (ARRAY['Rüsselsheim'::text, 'Kelsterbach'::text, 'Groß-Gerau'::text])));

ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_location_chk;
ALTER TABLE public.players ADD CONSTRAINT players_location_chk
  CHECK ((location IS NULL) OR (location = ANY (ARRAY['Rüsselsheim'::text, 'Kelsterbach'::text, 'Groß-Gerau'::text])));

-- trainer_schedules.location ist NOT NULL → kein IS-NULL-Zweig.
ALTER TABLE public.trainer_schedules DROP CONSTRAINT IF EXISTS trainer_schedules_location_chk;
ALTER TABLE public.trainer_schedules ADD CONSTRAINT trainer_schedules_location_chk
  CHECK (location = ANY (ARRAY['Rüsselsheim'::text, 'Kelsterbach'::text, 'Groß-Gerau'::text]));

-- 2) book_with_token: Standort-Validierung um 'Groß-Gerau' erweitern ---------
-- Authoritativer Funktionsrumpf aus 20260607_book_with_token_permission_check.sql;
-- einzige Änderung ist die NOT-IN-Liste der Standort-Prüfung.

CREATE OR REPLACE FUNCTION public.book_with_token(
  p_player_id uuid,
  p_token_id  uuid,
  p_date      date,
  p_time      time without time zone,
  p_program   text,
  p_location  text DEFAULT NULL
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_token      public.cancellation_tokens%ROWTYPE;
  v_player     public.players%ROWTYPE;
  v_appt       public.appointments%ROWTYPE;
  v_category   text;
  v_birth_year int;
  v_trainer_id uuid;
  v_is_admin   boolean;
  v_allowed    boolean;
BEGIN
  IF p_date < CURRENT_DATE THEN
    RETURN json_build_object('error', 'Das Datum liegt in der Vergangenheit.');
  END IF;

  IF NOT public.is_bookable_day(p_date) THEN
    RETURN json_build_object('error', 'An Wochenenden und Feiertagen sind keine Buchungen möglich.');
  END IF;

  IF p_location IS NOT NULL AND p_location NOT IN ('Rüsselsheim', 'Kelsterbach', 'Groß-Gerau') THEN
    RETURN json_build_object('error', 'Ungültiger Standort.');
  END IF;

  -- Nur bekannte Programme zulassen (sonst faellt die Kategorie-CASE unten
  -- still auf 'gruppe' zurueck und der Berechtigungs-Check liefe ins Leere).
  IF p_program NOT IN ('individual','gruppe','athletik','torhueter_individual','torhueter_gruppe') THEN
    RETURN json_build_object('error', 'Ungültiges Programm.');
  END IF;

  v_is_admin := public.is_admin();

  -- Spieler laden + autorisieren (eigenes Kind oder Admin).
  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id
    AND (parent_id = (SELECT auth.uid()) OR v_is_admin);

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Spieler nicht gefunden oder kein Zugriff.');
  END IF;

  -- Buchungsberechtigung pro Programm. Admin bucht ohne Einschraenkung.
  IF NOT v_is_admin THEN
    v_allowed := CASE p_program
      WHEN 'individual'           THEN v_player.can_book_individual
      WHEN 'gruppe'               THEN v_player.can_book_gruppe
      WHEN 'athletik'             THEN v_player.can_book_athletik
      WHEN 'torhueter_individual' THEN v_player.can_book_torhueter_individual
      WHEN 'torhueter_gruppe'     THEN v_player.can_book_torhueter_gruppe
    END;
    IF NOT v_allowed THEN
      RETURN json_build_object('error', 'Für dieses Programm besteht keine Buchungsberechtigung.');
    END IF;
  END IF;

  SELECT * INTO v_token
  FROM public.cancellation_tokens
  WHERE id        = p_token_id
    AND player_id = p_player_id
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

  v_birth_year := CASE
    WHEN v_player.birth_date IS NOT NULL
    THEN EXTRACT(YEAR FROM v_player.birth_date)::int
    ELSE NULL
  END;

  v_trainer_id := public.find_available_trainer(p_date, p_time, p_program, p_location);

  IF v_trainer_id IS NULL THEN
    RETURN json_build_object('error', 'Für diesen Zeitpunkt ist kein Trainer verfügbar.');
  END IF;

  INSERT INTO public.appointments
    (player_id, date, "time", status, program, trainer_id, session_birth_year, session_level,
     is_makeup, makeup_count, location)
  VALUES (
    p_player_id,
    p_date, p_time, 'confirmed', p_program,
    v_trainer_id,
    v_birth_year,
    v_player.level,
    true,
    v_token.makeup_count,
    p_location
  )
  RETURNING * INTO v_appt;

  UPDATE public.cancellation_tokens SET used_at = NOW() WHERE id = p_token_id;

  RETURN json_build_object('appointment', json_build_object(
    'id',                 v_appt.id,
    'player_id',          v_appt.player_id,
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
$$;

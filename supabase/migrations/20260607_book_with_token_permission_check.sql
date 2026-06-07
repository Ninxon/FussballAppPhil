-- ============================================================
-- book_with_token: Buchungsberechtigung (can_book_*) serverseitig erzwingen
-- ============================================================
-- Bisher gatete die Funktion nur ueber die Token-Kategorie. Der can_book_*-Check
-- lief ausschliesslich im Client (useAppointments.ts). Wer die RPC direkt aufruft,
-- konnte mit einem passenden Token ein Programm buchen, fuer das das Flag aus ist.
-- Jetzt: unbekanntes Programm wird abgewiesen, und ohne Admin-Rechte muss das
-- passende can_book_*-Flag des Spielers gesetzt sein. Admin bleibt ungated.
-- Reines Funktions-Replace, keine Schemaaenderung.
-- ============================================================

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

  IF p_location IS NOT NULL AND p_location NOT IN ('Rüsselsheim', 'Kelsterbach') THEN
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

ALTER FUNCTION public.book_with_token(uuid, uuid, date, time without time zone, text, text) OWNER TO postgres;
COMMENT ON FUNCTION public.book_with_token(uuid, uuid, date, time without time zone, text, text) IS '@omit';
REVOKE ALL ON FUNCTION public.book_with_token(uuid, uuid, date, time without time zone, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_with_token(uuid, uuid, date, time without time zone, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.book_with_token(uuid, uuid, date, time without time zone, text, text) TO service_role;


-- ============================================================
-- Pre-Launch-Härtung der Funktions-Rechte (Advisor 0028/0029)
-- ============================================================
-- Die neue book_with_token-Signatur erhielt über ALTER DEFAULT PRIVILEGES
-- automatisch anon-EXECUTE; das REVOKE oben traf nur PUBLIC. Hier anon explizit
-- entfernen (Buchen erfordert ohnehin eine Session). Reine Trigger-Funktionen
-- sind keine API-Endpunkte -> EXECUTE komplett sperren (Trigger feuern weiter).
REVOKE EXECUTE ON FUNCTION public.book_with_token(uuid, uuid, date, time without time zone, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_trainer_monthly_counts() FROM anon;
REVOKE ALL ON FUNCTION public.guard_profile_self_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_trainer_schedules_block_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_trainer_schedules_migrate_appts() FROM PUBLIC, anon, authenticated;

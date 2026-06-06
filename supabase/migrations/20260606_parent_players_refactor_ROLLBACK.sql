-- ============================================================
-- ROLLBACK zu 20260606_parent_players_refactor.sql
-- ============================================================
-- Kehrt den Eltern-/Spieler-Umbau vollstaendig um: player_id -> user_id auf
-- appointments + cancellation_tokens, stellt die alten Funktions-Signaturen
-- und RLS-Policies (Stand schema_live.sql, vor der Migration) wieder her und
-- entfernt die players-Tabelle.
--
-- ZWECK: Sicherheitsnetz statt PITR (Free-Plan ohne Dashboard-Snapshots).
-- Voraussetzung: players existiert noch (user_id wird aus players.parent_id
-- rekonstruiert). Falls players bereits weg ist, stattdessen die JSON-Backups
-- (appointments.json mit user_id, cancellation_tokens.json) einspielen.
--
-- Atomar: bei jedem Fehler wird alles zurueckgerollt.
-- NICHT automatisch ausfuehren — nur manuell im Ernstfall.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. appointments: player_id -> user_id (aus players.parent_id)
-- ------------------------------------------------------------
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='appointments' AND column_name='player_id'
  ) THEN
    UPDATE public.appointments a
       SET user_id = pl.parent_id
      FROM public.players pl
     WHERE pl.id = a.player_id
       AND a.user_id IS NULL;

    IF EXISTS (SELECT 1 FROM public.appointments WHERE user_id IS NULL) THEN
      RAISE EXCEPTION 'Rollback abgebrochen: % Termine ohne user_id (player ohne parent?).',
        (SELECT count(*) FROM public.appointments WHERE user_id IS NULL);
    END IF;
  END IF;
END $$;

ALTER TABLE public.appointments ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_user_id_fkey') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_player_id_fkey;
DROP INDEX IF EXISTS public.idx_appointments_player_date_status;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS player_id;
CREATE INDEX IF NOT EXISTS idx_appointments_user_date_status
  ON public.appointments USING btree (user_id, date, status);

-- ------------------------------------------------------------
-- 2. cancellation_tokens: player_id -> user_id
-- ------------------------------------------------------------
ALTER TABLE public.cancellation_tokens ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cancellation_tokens' AND column_name='player_id'
  ) THEN
    UPDATE public.cancellation_tokens t
       SET user_id = pl.parent_id
      FROM public.players pl
     WHERE pl.id = t.player_id
       AND t.user_id IS NULL;

    IF EXISTS (SELECT 1 FROM public.cancellation_tokens WHERE user_id IS NULL) THEN
      RAISE EXCEPTION 'Rollback abgebrochen: % Tokens ohne user_id.',
        (SELECT count(*) FROM public.cancellation_tokens WHERE user_id IS NULL);
    END IF;
  END IF;
END $$;

ALTER TABLE public.cancellation_tokens ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cancellation_tokens_user_id_fkey') THEN
    ALTER TABLE public.cancellation_tokens
      ADD CONSTRAINT cancellation_tokens_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.cancellation_tokens DROP CONSTRAINT IF EXISTS cancellation_tokens_player_id_fkey;
DROP INDEX IF EXISTS public.idx_tokens_player_active;
ALTER TABLE public.cancellation_tokens DROP COLUMN IF EXISTS player_id;
CREATE INDEX IF NOT EXISTS idx_tokens_user_active
  ON public.cancellation_tokens USING btree (user_id, used_at, expires_at);

-- ------------------------------------------------------------
-- 3. Funktionen auf den Vorzustand (schema_live.sql) zuruecksetzen
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.book_with_token(uuid, uuid, date, time without time zone, text, text);

CREATE OR REPLACE FUNCTION public.book_with_token("p_token_id" uuid, "p_date" date, "p_time" time without time zone, "p_program" text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
    AS $$
BEGIN
  RETURN public.book_with_token(p_token_id, p_date, p_time, p_program, NULL);
END;
$$;
COMMENT ON FUNCTION public.book_with_token(uuid, date, time without time zone, text) IS '@omit';

CREATE OR REPLACE FUNCTION public.book_with_token("p_token_id" uuid, "p_date" date, "p_time" time without time zone, "p_program" text, "p_location" text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
    AS $$
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
  WHERE id = p_token_id AND user_id = (SELECT auth.uid())
    AND used_at IS NULL AND expires_at > NOW()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Token nicht gefunden oder abgelaufen.');
  END IF;

  v_category := CASE p_program
    WHEN 'individual' THEN 'individual'
    WHEN 'torhueter_individual' THEN 'individual'
    ELSE 'gruppe' END;
  IF v_token.category != v_category THEN
    RETURN json_build_object('error', 'Token-Kategorie passt nicht zum gewählten Programm.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = (SELECT auth.uid());
  v_birth_year := CASE WHEN v_profile.birth_date IS NOT NULL
    THEN EXTRACT(YEAR FROM v_profile.birth_date)::int ELSE NULL END;

  v_trainer_id := public.find_available_trainer(p_date, p_time, p_program, p_location);
  IF v_trainer_id IS NULL THEN
    RETURN json_build_object('error', 'Für diesen Zeitpunkt ist kein Trainer verfügbar.');
  END IF;

  INSERT INTO public.appointments
    (user_id, date, "time", status, program, trainer_id, session_birth_year, session_level,
     is_makeup, makeup_count, location)
  VALUES ((SELECT auth.uid()), p_date, p_time, 'confirmed', p_program, v_trainer_id,
     v_birth_year, v_profile.level, true, v_token.makeup_count, p_location)
  RETURNING * INTO v_appt;

  UPDATE public.cancellation_tokens SET used_at = NOW() WHERE id = p_token_id;

  RETURN json_build_object('appointment', json_build_object(
    'id', v_appt.id, 'user_id', v_appt.user_id, 'date', v_appt.date::text,
    'time', to_char(v_appt.time, 'HH24:MI'), 'status', v_appt.status, 'program', v_appt.program,
    'trainer_id', v_appt.trainer_id, 'session_birth_year', v_appt.session_birth_year,
    'session_level', v_appt.session_level, 'attended', v_appt.attended,
    'is_makeup', v_appt.is_makeup, 'makeup_count', v_appt.makeup_count,
    'location', v_appt.location, 'created_at', v_appt.created_at));
END;
$$;
COMMENT ON FUNCTION public.book_with_token(uuid, date, time without time zone, text, text) IS NULL;

CREATE OR REPLACE FUNCTION public.cancel_and_issue_token("p_appointment_id" uuid, "p_skip_token" boolean DEFAULT false) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
    AS $$
DECLARE
  v_appt            public.appointments%ROWTYPE;
  v_token           public.cancellation_tokens%ROWTYPE;
  v_category        text;
  v_is_admin        boolean;
  v_within_deadline boolean;
  v_has_open_chain  boolean;
BEGIN
  v_is_admin := public.is_admin();
  SELECT * INTO v_appt FROM public.appointments
  WHERE id = p_appointment_id AND ((SELECT auth.uid()) = user_id OR v_is_admin)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Termin nicht gefunden.'); END IF;
  IF v_appt.status = 'cancelled' THEN RETURN json_build_object('error', 'Termin ist bereits storniert.'); END IF;

  IF v_appt.is_makeup AND NOT v_is_admin AND v_appt.makeup_count >= 2 THEN
    RETURN json_build_object('error', 'Dieser Nachholtermin kann nicht mehr storniert werden. Bitte wende dich an deinen Trainer.');
  END IF;

  IF NOT v_appt.is_makeup AND NOT v_is_admin THEN
    SELECT EXISTS (SELECT 1 FROM public.cancellation_tokens
       WHERE user_id = v_appt.user_id AND used_at IS NULL AND expires_at > NOW())
    OR EXISTS (SELECT 1 FROM public.appointments
       WHERE user_id = v_appt.user_id AND id <> v_appt.id AND is_makeup = true AND status = 'confirmed'
         AND (date + "time") > (NOW() AT TIME ZONE 'Europe/Berlin')::timestamp)
    INTO v_has_open_chain;
    IF v_has_open_chain THEN
      RETURN json_build_object('error', 'Du hast bereits einen offenen Nachholtermin oder Gutschein. Schliesse diesen erst ab, bevor du einen weiteren Termin stornieren kannst.');
    END IF;
  END IF;

  v_within_deadline := (v_appt.date + v_appt.time) - (NOW() AT TIME ZONE 'Europe/Berlin') < INTERVAL '3 hours';
  v_category := CASE v_appt.program
    WHEN 'individual' THEN 'individual' WHEN 'torhueter_individual' THEN 'individual' ELSE 'gruppe' END;

  UPDATE public.appointments SET status = 'cancelled' WHERE id = p_appointment_id;

  IF p_skip_token OR (v_appt.is_makeup AND v_is_admin) OR (v_within_deadline AND NOT v_is_admin) THEN
    RETURN json_build_object('appointment_id', p_appointment_id);
  END IF;

  INSERT INTO public.cancellation_tokens (user_id, category, expires_at, source_appointment_id, makeup_count)
  VALUES (v_appt.user_id, v_category,
    ((v_appt.date + INTERVAL '1 month' + INTERVAL '1 day') AT TIME ZONE 'Europe/Berlin'),
    p_appointment_id, CASE WHEN v_appt.is_makeup THEN v_appt.makeup_count + 1 ELSE 0 END)
  RETURNING * INTO v_token;

  RETURN json_build_object('appointment_id', p_appointment_id, 'token', row_to_json(v_token));
END;
$$;
COMMENT ON FUNCTION public.cancel_and_issue_token(uuid, boolean) IS '@omit';

CREATE OR REPLACE FUNCTION public.check_daily_booking_limit() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO ''
    AS $$
DECLARE existing_count INTEGER;
BEGIN
  IF NEW.status != 'confirmed' THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text || '|' || NEW.date::text, 0));
  SELECT COUNT(*) INTO existing_count FROM public.appointments
   WHERE user_id = NEW.user_id AND date = NEW.date AND status = 'confirmed' AND id != NEW.id;
  IF existing_count >= 2 THEN RAISE EXCEPTION 'Bereits zwei Termine an diesem Tag gebucht.'; END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 4. RLS auf den Vorzustand
-- ------------------------------------------------------------
DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments FOR SELECT TO authenticated
  USING (((SELECT public.is_admin()) OR ((SELECT auth.uid()) = user_id)
    OR ((trainer_id IS NOT NULL) AND ((SELECT auth.uid()) = trainer_id))));

DROP POLICY IF EXISTS tokens_select ON public.cancellation_tokens;
CREATE POLICY tokens_select ON public.cancellation_tokens FOR SELECT TO authenticated
  USING (((SELECT public.is_admin()) OR ((SELECT auth.uid()) = user_id)));

DROP POLICY IF EXISTS players_select ON public.players;
DROP POLICY IF EXISTS players_insert ON public.players;
DROP POLICY IF EXISTS players_update ON public.players;
DROP POLICY IF EXISTS players_delete ON public.players;

-- ------------------------------------------------------------
-- 5. Realtime + players-Tabelle entfernen
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='players') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.players;
  END IF;
END $$;

DROP TABLE IF EXISTS public.players;       -- FKs darauf wurden oben entfernt
DROP FUNCTION IF EXISTS public.assign_player_number();

COMMIT;

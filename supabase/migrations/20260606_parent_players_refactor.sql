-- ============================================================
-- Eltern-Account mit mehreren Spielern (Option C)
-- ============================================================
-- Ein Eltern-Account (= ein Auth-User / eine profiles-Zeile) verwaltet N
-- Spieler (Kinder). Neue Tabelle public.players; appointments und
-- cancellation_tokens referenzieren ab jetzt player_id statt user_id. Alle
-- Buchungsregeln (2/Tag, Token-Kette, makeup-Cap, Kapazitaet) gelten pro
-- Spieler. Auth/Profil bleibt der Elternteil.
--
-- Diese Migration ist idempotent (re-runnable) und laeuft atomar. Strukturelle
-- Schritte sind in Spalten-/Constraint-Existenz-Guards gekapselt; nach jedem
-- Backfill bricht eine Assertion bei Orphans die Transaktion ab.
--
-- WICHTIG: Harter Schnitt user_id -> player_id. DB-Migration, Edge Functions
-- und Apps muessen GEMEINSAM deployt werden (siehe Plan). Vor dem Live-Lauf:
-- Snapshot/Backup (siehe Verifikations-Checkliste).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1.1  Tabelle players
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
  id            uuid DEFAULT gen_random_uuid() NOT NULL,
  parent_id     uuid NOT NULL,
  name          text DEFAULT ''::text NOT NULL,
  birth_date    date,
  level         text,
  player_type   text,
  can_book_individual           boolean DEFAULT false NOT NULL,
  can_book_gruppe               boolean DEFAULT false NOT NULL,
  can_book_athletik             boolean DEFAULT false NOT NULL,
  can_book_torhueter_individual boolean DEFAULT false NOT NULL,
  can_book_torhueter_gruppe     boolean DEFAULT false NOT NULL,
  skip_group_age_level_check    boolean DEFAULT false NOT NULL,
  location      text,
  player_number integer,
  is_active     boolean DEFAULT true NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_parent_id_fkey FOREIGN KEY (parent_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT players_player_number_key UNIQUE (player_number),
  CONSTRAINT players_level_check CHECK (
    level IS NULL OR level = ANY (ARRAY['anfaenger'::text,'amateur'::text,'profi'::text,'experte'::text])),
  CONSTRAINT players_player_type_check CHECK (
    player_type IS NULL OR player_type = ANY (ARRAY['torwart'::text,'feldspieler'::text])),
  CONSTRAINT players_location_chk CHECK (
    location IS NULL OR location = ANY (ARRAY['Rüsselsheim'::text,'Kelsterbach'::text]))
);

ALTER TABLE public.players OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_players_parent_id ON public.players USING btree (parent_id);

GRANT ALL ON TABLE public.players TO anon;
GRANT ALL ON TABLE public.players TO authenticated;
GRANT ALL ON TABLE public.players TO service_role;

-- player_number aus der bestehenden customer_number_seq vergeben.
-- Der NULL-Guard sorgt dafuer, dass migrierte Zeilen ihre Nummer behalten.
CREATE OR REPLACE FUNCTION public.assign_player_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.player_number IS NULL THEN
    NEW.player_number := nextval('public.customer_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assign_player_number() OWNER TO postgres;

GRANT ALL ON FUNCTION public.assign_player_number() TO anon;
GRANT ALL ON FUNCTION public.assign_player_number() TO authenticated;
GRANT ALL ON FUNCTION public.assign_player_number() TO service_role;

DROP TRIGGER IF EXISTS assign_player_number_trigger ON public.players;
CREATE TRIGGER assign_player_number_trigger
  BEFORE INSERT ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.assign_player_number();

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 1.2  Backfill players aus bestehenden Kunden (1:1)
-- ------------------------------------------------------------
INSERT INTO public.players (
  parent_id, name, birth_date, level, player_type,
  can_book_individual, can_book_gruppe, can_book_athletik,
  can_book_torhueter_individual, can_book_torhueter_gruppe,
  skip_group_age_level_check, location, player_number, is_active
)
SELECT
  p.id, p.full_name, p.birth_date, p.level, p.player_type,
  p.can_book_individual, p.can_book_gruppe, p.can_book_athletik,
  p.can_book_torhueter_individual, p.can_book_torhueter_gruppe,
  p.skip_group_age_level_check, p.location, p.customer_number, p.is_active
FROM public.profiles p
WHERE p.role = 'customer'
  AND NOT EXISTS (SELECT 1 FROM public.players pl WHERE pl.parent_id = p.id);

-- Assertion: genau ein Player pro Kunden-Profil.
DO $$
DECLARE
  v_customers int;
  v_players   int;
BEGIN
  SELECT count(*) INTO v_customers FROM public.profiles WHERE role = 'customer';
  SELECT count(*) INTO v_players
    FROM public.players pl
    JOIN public.profiles p ON p.id = pl.parent_id AND p.role = 'customer';
  IF v_players < v_customers THEN
    RAISE EXCEPTION 'Migration abgebrochen: % Kunden-Profile, aber nur % zugeordnete Player.', v_customers, v_players;
  END IF;
END $$;

-- Sequenz hochsetzen, damit neue Spieler nicht mit Bestandsnummern kollidieren.
SELECT setval(
  'public.customer_number_seq',
  GREATEST(
    COALESCE((SELECT max(player_number) FROM public.players), 100),
    COALESCE((SELECT max(customer_number) FROM public.profiles), 100)
  ),
  true
);

-- ------------------------------------------------------------
-- 1.3  appointments: user_id -> player_id
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='appointments' AND column_name='player_id'
  ) THEN
    ALTER TABLE public.appointments ADD COLUMN player_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='appointments' AND column_name='user_id'
  ) THEN
    UPDATE public.appointments a
       SET player_id = pl.id
      FROM public.players pl
     WHERE pl.parent_id = a.user_id
       AND a.player_id IS NULL;

    IF EXISTS (SELECT 1 FROM public.appointments WHERE player_id IS NULL) THEN
      RAISE EXCEPTION 'Migration abgebrochen: % Termine ohne zuordenbaren Player (orphan user_id).',
        (SELECT count(*) FROM public.appointments WHERE player_id IS NULL);
    END IF;
  END IF;
END $$;

ALTER TABLE public.appointments ALTER COLUMN player_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_player_id_fkey') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_player_id_fkey FOREIGN KEY (player_id)
      REFERENCES public.players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- RLS-Policy ZUERST auf player_id umstellen, sonst blockiert sie (Abhaengigkeit
-- auf user_id) den folgenden DROP COLUMN.
DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR player_id IN (SELECT id FROM public.players WHERE parent_id = (SELECT auth.uid()))
    OR (trainer_id IS NOT NULL AND (SELECT auth.uid()) = trainer_id)
  );

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_user_id_fkey;
DROP INDEX IF EXISTS public.idx_appointments_user_date_status;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS user_id;
CREATE INDEX IF NOT EXISTS idx_appointments_player_date_status
  ON public.appointments USING btree (player_id, date, status);

-- ------------------------------------------------------------
-- 1.4  cancellation_tokens: user_id -> player_id
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cancellation_tokens' AND column_name='player_id'
  ) THEN
    ALTER TABLE public.cancellation_tokens ADD COLUMN player_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cancellation_tokens' AND column_name='user_id'
  ) THEN
    UPDATE public.cancellation_tokens t
       SET player_id = pl.id
      FROM public.players pl
     WHERE pl.parent_id = t.user_id
       AND t.player_id IS NULL;

    IF EXISTS (SELECT 1 FROM public.cancellation_tokens WHERE player_id IS NULL) THEN
      RAISE EXCEPTION 'Migration abgebrochen: % Tokens ohne zuordenbaren Player (orphan user_id).',
        (SELECT count(*) FROM public.cancellation_tokens WHERE player_id IS NULL);
    END IF;
  END IF;
END $$;

ALTER TABLE public.cancellation_tokens ALTER COLUMN player_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cancellation_tokens_player_id_fkey') THEN
    ALTER TABLE public.cancellation_tokens
      ADD CONSTRAINT cancellation_tokens_player_id_fkey FOREIGN KEY (player_id)
      REFERENCES public.players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- RLS-Policy zuerst auf player_id umstellen (Abhaengigkeit vor DROP COLUMN loesen).
DROP POLICY IF EXISTS tokens_select ON public.cancellation_tokens;
CREATE POLICY tokens_select ON public.cancellation_tokens
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR player_id IN (SELECT id FROM public.players WHERE parent_id = (SELECT auth.uid()))
  );

ALTER TABLE public.cancellation_tokens DROP CONSTRAINT IF EXISTS cancellation_tokens_user_id_fkey;
DROP INDEX IF EXISTS public.idx_tokens_user_active;
ALTER TABLE public.cancellation_tokens DROP COLUMN IF EXISTS user_id;
CREATE INDEX IF NOT EXISTS idx_tokens_player_active
  ON public.cancellation_tokens USING btree (player_id, used_at, expires_at);

-- ------------------------------------------------------------
-- 1.5  Funktions-Rewrites
-- ------------------------------------------------------------

-- book_with_token: neue kanonische Signatur mit p_player_id. Alte Arities
-- (4-arg, alte 5-arg) entfernen -- kein stilles Erraten des Kindes.
DROP FUNCTION IF EXISTS public.book_with_token(uuid, date, time without time zone, text);
DROP FUNCTION IF EXISTS public.book_with_token(uuid, date, time without time zone, text, text);

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

  -- Spieler laden + autorisieren (eigenes Kind oder Admin).
  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id
    AND (parent_id = (SELECT auth.uid()) OR public.is_admin());

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Spieler nicht gefunden oder kein Zugriff.');
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


-- cancel_and_issue_token: Signatur unveraendert, Autorisierung jetzt ueber
-- den Join appointments -> players (parent_id = auth.uid() ODER Admin),
-- Storno-Ketten und Token-Ausstellung pro player_id.
CREATE OR REPLACE FUNCTION public.cancel_and_issue_token(
  p_appointment_id uuid,
  p_skip_token     boolean DEFAULT false
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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

  SELECT a.* INTO v_appt
  FROM public.appointments a
  JOIN public.players pl ON pl.id = a.player_id
  WHERE a.id = p_appointment_id
    AND (pl.parent_id = (SELECT auth.uid()) OR v_is_admin)
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Termin nicht gefunden.');
  END IF;

  IF v_appt.status = 'cancelled' THEN
    RETURN json_build_object('error', 'Termin ist bereits storniert.');
  END IF;

  -- Kunde darf einen Nachholtermin maximal zweimal stornieren (count 0 und 1).
  IF v_appt.is_makeup AND NOT v_is_admin AND v_appt.makeup_count >= 2 THEN
    RETURN json_build_object('error',
      'Dieser Nachholtermin kann nicht mehr storniert werden. Bitte wende dich an deinen Trainer.');
  END IF;

  -- Nur eine aktive Storno-Kette gleichzeitig (pro Spieler). Nachhol-Stornos
  -- und Admin-Stornos sind ausgenommen.
  IF NOT v_appt.is_makeup AND NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.cancellation_tokens
       WHERE player_id  = v_appt.player_id
         AND used_at    IS NULL
         AND expires_at > NOW()
    ) OR EXISTS (
      SELECT 1 FROM public.appointments
       WHERE player_id  = v_appt.player_id
         AND id         <> v_appt.id
         AND is_makeup  = true
         AND status     = 'confirmed'
         AND (date + "time") > (NOW() AT TIME ZONE 'Europe/Berlin')::timestamp
    ) INTO v_has_open_chain;

    IF v_has_open_chain THEN
      RETURN json_build_object('error',
        'Du hast bereits einen offenen Nachholtermin oder Gutschein. Schliesse diesen erst ab, bevor du einen weiteren Termin stornieren kannst.');
    END IF;
  END IF;

  -- 3-Stunden-Frist (Europe/Berlin): innerhalb der Frist storniert ein Kunde
  -- zwar weiterhin, erhaelt aber keinen Nachhol-Token.
  v_within_deadline :=
    (v_appt.date + v_appt.time) - (NOW() AT TIME ZONE 'Europe/Berlin') < INTERVAL '3 hours';

  v_category := CASE v_appt.program
    WHEN 'individual'           THEN 'individual'
    WHEN 'torhueter_individual' THEN 'individual'
    ELSE 'gruppe'
  END;

  UPDATE public.appointments SET status = 'cancelled' WHERE id = p_appointment_id;

  -- Kein Token, wenn: explizit angefordert (p_skip_token), Admin storniert
  -- einen Nachholtermin, oder Kunde storniert innerhalb der 3-Stunden-Frist.
  IF p_skip_token
     OR (v_appt.is_makeup AND v_is_admin)
     OR (v_within_deadline AND NOT v_is_admin) THEN
    RETURN json_build_object('appointment_id', p_appointment_id);
  END IF;

  INSERT INTO public.cancellation_tokens
    (player_id, category, expires_at, source_appointment_id, makeup_count)
  VALUES (
    v_appt.player_id, v_category,
    ((v_appt.date + INTERVAL '1 month' + INTERVAL '1 day') AT TIME ZONE 'Europe/Berlin'),
    p_appointment_id,
    CASE WHEN v_appt.is_makeup THEN v_appt.makeup_count + 1 ELSE 0 END
  )
  RETURNING * INTO v_token;

  RETURN json_build_object(
    'appointment_id', p_appointment_id,
    'token',          row_to_json(v_token)
  );
END;
$$;

ALTER FUNCTION public.cancel_and_issue_token(uuid, boolean) OWNER TO postgres;
COMMENT ON FUNCTION public.cancel_and_issue_token(uuid, boolean) IS '@omit';


-- check_daily_booking_limit: Lock-Key + COUNT auf player_id.
CREATE OR REPLACE FUNCTION public.check_daily_booking_limit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.player_id::text || '|' || NEW.date::text, 0)
  );

  SELECT COUNT(*) INTO existing_count
    FROM public.appointments
   WHERE player_id = NEW.player_id
     AND date      = NEW.date
     AND status    = 'confirmed'
     AND id       != NEW.id;

  IF existing_count >= 2 THEN
    RAISE EXCEPTION 'Bereits zwei Termine an diesem Tag gebucht.';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_daily_booking_limit() OWNER TO postgres;

-- ------------------------------------------------------------
-- 1.6  RLS
-- ------------------------------------------------------------

-- players: Eltern lesen ihre Kinder, Trainer lesen alle Spieler, Admin alles.
-- Writes ausschliesslich Admin (Eltern read-only -> kein Self-Update-Guard noetig).
DROP POLICY IF EXISTS players_select ON public.players;
CREATE POLICY players_select ON public.players
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR parent_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid()) AND p.role = 'trainer'
    )
  );

DROP POLICY IF EXISTS players_insert ON public.players;
CREATE POLICY players_insert ON public.players
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS players_update ON public.players;
CREATE POLICY players_update ON public.players
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS players_delete ON public.players;
CREATE POLICY players_delete ON public.players
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- (appointments_select + tokens_select wurden bereits in 1.3/1.4 auf player_id
--  umgestellt — vor dem jeweiligen DROP COLUMN, um die Abhaengigkeit zu loesen.)

-- ------------------------------------------------------------
-- 1.7  Realtime: players in die Publication aufnehmen
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
  END IF;
END $$;

COMMIT;

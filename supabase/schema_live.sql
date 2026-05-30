


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."assign_customer_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.customer_number IS NULL THEN
    NEW.customer_number := nextval('public.customer_number_seq');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_customer_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.book_with_token(p_token_id, p_date, p_time, p_program, NULL);
END;
$$;


ALTER FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text") IS '@omit';



CREATE OR REPLACE FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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
$$;


ALTER FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_and_issue_token"("p_appointment_id" "uuid", "p_skip_token" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND ((SELECT auth.uid()) = user_id OR v_is_admin)
  FOR UPDATE;

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

  -- Nur eine aktive Storno-Kette gleichzeitig: ein Kunde darf einen Original-
  -- termin nicht stornieren, solange noch eine Kette offen ist (offener Token
  -- oder zukuenftiger Nachholtermin). Nachhol-Stornos und Admin-Stornos sind
  -- ausgenommen.
  IF NOT v_appt.is_makeup AND NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.cancellation_tokens
       WHERE user_id    = v_appt.user_id
         AND used_at    IS NULL
         AND expires_at > NOW()
    ) OR EXISTS (
      SELECT 1 FROM public.appointments
       WHERE user_id    = v_appt.user_id
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
    (user_id, category, expires_at, source_appointment_id, makeup_count)
  VALUES (
    v_appt.user_id, v_category, NOW() + INTERVAL '1 month', p_appointment_id,
    CASE WHEN v_appt.is_makeup THEN v_appt.makeup_count + 1 ELSE 0 END
  )
  RETURNING * INTO v_token;

  RETURN json_build_object(
    'appointment_id', p_appointment_id,
    'token',          row_to_json(v_token)
  );
END;
$$;


ALTER FUNCTION "public"."cancel_and_issue_token"("p_appointment_id" "uuid", "p_skip_token" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cancel_and_issue_token"("p_appointment_id" "uuid", "p_skip_token" boolean) IS '@omit';



CREATE OR REPLACE FUNCTION "public"."check_daily_booking_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text || '|' || NEW.date::text, 0)
  );

  SELECT COUNT(*) INTO existing_count
    FROM public.appointments
   WHERE user_id = NEW.user_id
     AND date    = NEW.date
     AND status  = 'confirmed'
     AND id     != NEW.id;

  IF existing_count >= 2 THEN
    RAISE EXCEPTION 'Bereits zwei Termine an diesem Tag gebucht.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_daily_booking_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_slot_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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
$$;


ALTER FUNCTION "public"."check_slot_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT public.find_available_trainer(p_date, p_time, p_program, NULL);
$$;


ALTER FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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
$$;


ALTER FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."german_easter"("p_year" integer) RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."german_easter"("p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_slot_counts"() RETURNS TABLE("date" "text", "time" "text", "program" "text", "location" "text", "booked" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT a.date::text, to_char(a.time, 'HH24:MI'), a.program, a.location, COUNT(*)::bigint AS booked
  FROM public.appointments a
  WHERE a.status = 'confirmed'
  GROUP BY a.date, a.time, a.program, a.location;
$$;


ALTER FUNCTION "public"."get_slot_counts"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_slot_counts"() IS '@omit';



CREATE OR REPLACE FUNCTION "public"."get_slot_players"() RETURNS TABLE("date" "text", "time" "text", "program" "text", "location" "text", "session_birth_year" integer, "session_level" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT a.date::text, to_char(a.time, 'HH24:MI'), a.program, a.location, a.session_birth_year, a.session_level, a.created_at
  FROM public.appointments a
  WHERE a.status = 'confirmed'
    AND a.session_birth_year IS NOT NULL;
$$;


ALTER FUNCTION "public"."get_slot_players"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_slot_players"() IS '@omit';



CREATE OR REPLACE FUNCTION "public"."get_trainer_monthly_counts"() RETURNS TABLE("trainer_id" "uuid", "year_month" "text", "sessions" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT v.trainer_id, v.year_month, v.sessions
    FROM public.v_trainer_monthly_counts v;
END;
$$;


ALTER FUNCTION "public"."get_trainer_monthly_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT (SELECT public.is_admin()) THEN
    IF NEW.id                            IS DISTINCT FROM OLD.id
    OR NEW.full_name                     IS DISTINCT FROM OLD.full_name
    OR NEW.email                         IS DISTINCT FROM OLD.email
    OR NEW.birth_date                    IS DISTINCT FROM OLD.birth_date
    OR NEW.address                       IS DISTINCT FROM OLD.address
    OR NEW.customer_number               IS DISTINCT FROM OLD.customer_number
    OR NEW.is_active                     IS DISTINCT FROM OLD.is_active
    OR NEW.role                          IS DISTINCT FROM OLD.role
    OR NEW.level                         IS DISTINCT FROM OLD.level
    OR NEW.can_book_individual           IS DISTINCT FROM OLD.can_book_individual
    OR NEW.can_book_gruppe               IS DISTINCT FROM OLD.can_book_gruppe
    OR NEW.can_book_athletik             IS DISTINCT FROM OLD.can_book_athletik
    OR NEW.can_book_torhueter_individual IS DISTINCT FROM OLD.can_book_torhueter_individual
    OR NEW.can_book_torhueter_gruppe     IS DISTINCT FROM OLD.can_book_torhueter_gruppe
    OR NEW.player_type                   IS DISTINCT FROM OLD.player_type
    OR NEW.parent_name                   IS DISTINCT FROM OLD.parent_name
    OR NEW.trainer_specialty             IS DISTINCT FROM OLD.trainer_specialty
    THEN
      RAISE EXCEPTION 'Nur ein Admin darf dieses Profilfeld ändern.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_profile_self_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS '@omit';



CREATE OR REPLACE FUNCTION "public"."is_bookable_day"("d" "date") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  y int := EXTRACT(YEAR FROM d)::int;
  e date := public.german_easter(EXTRACT(YEAR FROM d)::int);
BEGIN
  IF EXTRACT(ISODOW FROM d) IN (6, 7) THEN
    RETURN false;
  END IF;
  IF d IN (
    make_date(y, 1, 1),
    e - 2,
    e + 1,
    make_date(y, 5, 1),
    e + 39,
    e + 50,
    make_date(y, 10, 3),
    make_date(y, 12, 25),
    make_date(y, 12, 26)
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."is_bookable_day"("d" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_trainer_schedules_block_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.appointments
   WHERE trainer_id = OLD.trainer_id
     AND date       >= CURRENT_DATE
     AND "time"     = OLD.time
     AND status     = 'confirmed'
     AND EXTRACT(ISODOW FROM date)::int = OLD.day_of_week;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Dieser Slot hat noch % zukünftige Buchung(en). Bitte erst stornieren oder umbuchen, bevor der Slot entfernt wird.', v_count
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."tg_trainer_schedules_block_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_trainer_schedules_migrate_appts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF OLD.location IS DISTINCT FROM NEW.location THEN
    UPDATE public.appointments
       SET location = NEW.location
     WHERE trainer_id = NEW.trainer_id
       AND date       >= CURRENT_DATE
       AND "time"     = NEW.time
       AND status     = 'confirmed'
       AND location IS NOT DISTINCT FROM OLD.location
       AND EXTRACT(ISODOW FROM date)::int = NEW.day_of_week;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_trainer_schedules_migrate_appts"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "program" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trainer_id" "uuid",
    "session_level" "text",
    "session_birth_year" integer,
    "attended" boolean,
    "is_makeup" boolean DEFAULT false NOT NULL,
    "makeup_count" integer DEFAULT 0 NOT NULL,
    "reminder_sent_at" timestamp with time zone,
    "location" "text",
    CONSTRAINT "appointments_location_chk" CHECK ((("location" IS NULL) OR ("location" = ANY (ARRAY['Rüsselsheim'::"text", 'Kelsterbach'::"text"])))),
    CONSTRAINT "appointments_program_check" CHECK (("program" = ANY (ARRAY['individual'::"text", 'gruppe'::"text", 'athletik'::"text", 'torhueter_individual'::"text", 'torhueter_gruppe'::"text"]))),
    CONSTRAINT "appointments_session_level_check" CHECK ((("session_level" IS NULL) OR ("session_level" = ANY (ARRAY['anfaenger'::"text", 'amateur'::"text", 'profi'::"text", 'experte'::"text"])))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cancellation_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '1 mon'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "source_appointment_id" "uuid",
    "makeup_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "cancellation_tokens_category_check" CHECK (("category" = ANY (ARRAY['individual'::"text", 'gruppe'::"text"])))
);


ALTER TABLE "public"."cancellation_tokens" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."customer_number_seq"
    START WITH 101
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."customer_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "location" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_global" boolean DEFAULT true
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text",
    "phone" "text",
    "birth_date" "date",
    "address" "text",
    "customer_number" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "level" "text",
    "can_book_individual" boolean DEFAULT false NOT NULL,
    "can_book_gruppe" boolean DEFAULT false NOT NULL,
    "can_book_athletik" boolean DEFAULT false NOT NULL,
    "can_book_torhueter_individual" boolean DEFAULT false NOT NULL,
    "can_book_torhueter_gruppe" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "player_type" "text",
    "parent_name" "text",
    "location" "text",
    "trainer_specialty" "text",
    CONSTRAINT "profiles_level_check" CHECK ((("level" IS NULL) OR ("level" = ANY (ARRAY['anfaenger'::"text", 'amateur'::"text", 'profi'::"text", 'experte'::"text"])))),
    CONSTRAINT "profiles_player_type_check" CHECK ((("player_type" IS NULL) OR ("player_type" = ANY (ARRAY['torwart'::"text", 'feldspieler'::"text"])))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'customer'::"text", 'trainer'::"text"]))),
    CONSTRAINT "profiles_trainer_specialty_check" CHECK ((("trainer_specialty" IS NULL) OR ("trainer_specialty" = ANY (ARRAY['spieler'::"text", 'torwart'::"text"]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainer_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "time" time without time zone NOT NULL,
    "location" "text" NOT NULL,
    CONSTRAINT "trainer_schedules_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 5))),
    CONSTRAINT "trainer_schedules_location_chk" CHECK (("location" = ANY (ARRAY['Rüsselsheim'::"text", 'Kelsterbach'::"text"])))
);


ALTER TABLE "public"."trainer_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainer_videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "url" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "storage_path" "text"
);


ALTER TABLE "public"."trainer_videos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_trainer_monthly_counts" WITH ("security_invoker"='on') AS
 SELECT "trainer_id",
    "to_char"(("date")::timestamp with time zone, 'YYYY-MM'::"text") AS "year_month",
    ("count"(*))::integer AS "sessions"
   FROM "public"."appointments"
  WHERE (("status" = 'confirmed'::"text") AND ("date" < CURRENT_DATE) AND ("trainer_id" IS NOT NULL))
  GROUP BY "trainer_id", ("to_char"(("date")::timestamp with time zone, 'YYYY-MM'::"text"));


ALTER VIEW "public"."v_trainer_monthly_counts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_tokens"
    ADD CONSTRAINT "cancellation_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_customer_number_key" UNIQUE ("customer_number");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainer_schedules"
    ADD CONSTRAINT "trainer_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainer_schedules"
    ADD CONSTRAINT "trainer_schedules_trainer_id_day_of_week_time_key" UNIQUE ("trainer_id", "day_of_week", "time");



ALTER TABLE ONLY "public"."trainer_videos"
    ADD CONSTRAINT "trainer_videos_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_appointments_date_status" ON "public"."appointments" USING "btree" ("date", "status");



CREATE INDEX "idx_appointments_date_time_program_status" ON "public"."appointments" USING "btree" ("date", "time", "program", "status");



CREATE INDEX "idx_appointments_reminder_pending" ON "public"."appointments" USING "btree" ("date") WHERE (("status" = 'confirmed'::"text") AND ("reminder_sent_at" IS NULL));



CREATE INDEX "idx_appointments_trainer_date_time" ON "public"."appointments" USING "btree" ("trainer_id", "date", "time") WHERE ("status" = 'confirmed'::"text");



CREATE INDEX "idx_appointments_trainer_id" ON "public"."appointments" USING "btree" ("trainer_id");



CREATE INDEX "idx_appointments_user_date_status" ON "public"."appointments" USING "btree" ("user_id", "date", "status");



CREATE INDEX "idx_notifications_created_by" ON "public"."notifications" USING "btree" ("created_by");



CREATE UNIQUE INDEX "idx_tokens_unique_source" ON "public"."cancellation_tokens" USING "btree" ("source_appointment_id") WHERE ("source_appointment_id" IS NOT NULL);



CREATE INDEX "idx_tokens_user_active" ON "public"."cancellation_tokens" USING "btree" ("user_id", "used_at", "expires_at");



CREATE INDEX "idx_trainer_schedules_day_time" ON "public"."trainer_schedules" USING "btree" ("day_of_week", "time");



CREATE INDEX "idx_trainer_schedules_trainer_day" ON "public"."trainer_schedules" USING "btree" ("trainer_id", "day_of_week");



CREATE INDEX "idx_trainer_videos_created_by" ON "public"."trainer_videos" USING "btree" ("created_by");



CREATE INDEX "idx_trainer_videos_trainer_id" ON "public"."trainer_videos" USING "btree" ("trainer_id");



CREATE OR REPLACE TRIGGER "assign_customer_number_trigger" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."assign_customer_number"();



CREATE OR REPLACE TRIGGER "enforce_daily_booking_limit" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."check_daily_booking_limit"();



CREATE OR REPLACE TRIGGER "enforce_slot_capacity" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."check_slot_capacity"();



CREATE OR REPLACE TRIGGER "guard_profile_self_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_self_update"();



CREATE OR REPLACE TRIGGER "trainer_schedules_block_delete" BEFORE DELETE ON "public"."trainer_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."tg_trainer_schedules_block_delete"();



CREATE OR REPLACE TRIGGER "trainer_schedules_migrate_appts" AFTER UPDATE ON "public"."trainer_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."tg_trainer_schedules_migrate_appts"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cancellation_tokens"
    ADD CONSTRAINT "cancellation_tokens_source_appointment_id_fkey" FOREIGN KEY ("source_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cancellation_tokens"
    ADD CONSTRAINT "cancellation_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trainer_schedules"
    ADD CONSTRAINT "trainer_schedules_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trainer_videos"
    ADD CONSTRAINT "trainer_videos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trainer_videos"
    ADD CONSTRAINT "trainer_videos_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_delete" ON "public"."appointments" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "appointments_insert" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "appointments_select" ON "public"."appointments" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "user_id") OR (("trainer_id" IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "trainer_id"))));



CREATE POLICY "appointments_update" ON "public"."appointments" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."cancellation_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "profiles_read_trainers" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("role" = ANY (ARRAY['trainer'::"text", 'admin'::"text"])));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "id"))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "tokens_delete" ON "public"."cancellation_tokens" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "tokens_insert" ON "public"."cancellation_tokens" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "tokens_select" ON "public"."cancellation_tokens" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "tokens_update" ON "public"."cancellation_tokens" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."trainer_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainer_videos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trainer_videos_delete" ON "public"."trainer_videos" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "trainer_id")));



CREATE POLICY "trainer_videos_insert" ON "public"."trainer_videos" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "trainer_id")));



CREATE POLICY "trainer_videos_select" ON "public"."trainer_videos" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "trainer_id")));



CREATE POLICY "trainer_videos_update" ON "public"."trainer_videos" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "trainer_id"))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "trainer_id")));



CREATE POLICY "ts_admin_write" ON "public"."trainer_schedules" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "ts_read" ON "public"."trainer_schedules" FOR SELECT TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."appointments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trainer_schedules";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."assign_customer_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_customer_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_customer_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_customer_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."book_with_token"("p_token_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_and_issue_token"("p_appointment_id" "uuid", "p_skip_token" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_and_issue_token"("p_appointment_id" "uuid", "p_skip_token" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_and_issue_token"("p_appointment_id" "uuid", "p_skip_token" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_daily_booking_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_daily_booking_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_daily_booking_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_daily_booking_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_slot_capacity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_slot_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_slot_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_slot_capacity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_available_trainer"("p_date" "date", "p_time" time without time zone, "p_program" "text", "p_location" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."german_easter"("p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."german_easter"("p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."german_easter"("p_year" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_slot_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_slot_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_slot_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_slot_players"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_slot_players"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_slot_players"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_trainer_monthly_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_trainer_monthly_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_trainer_monthly_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trainer_monthly_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profile_self_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profile_self_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profile_self_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_bookable_day"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_bookable_day"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_bookable_day"("d" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_trainer_schedules_block_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_trainer_schedules_block_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_trainer_schedules_block_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_trainer_schedules_migrate_appts"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_trainer_schedules_migrate_appts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_trainer_schedules_migrate_appts"() TO "service_role";
























GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."cancellation_tokens" TO "anon";
GRANT ALL ON TABLE "public"."cancellation_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."cancellation_tokens" TO "service_role";



GRANT ALL ON SEQUENCE "public"."customer_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."customer_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."customer_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."trainer_schedules" TO "anon";
GRANT ALL ON TABLE "public"."trainer_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."trainer_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."trainer_videos" TO "anon";
GRANT ALL ON TABLE "public"."trainer_videos" TO "authenticated";
GRANT ALL ON TABLE "public"."trainer_videos" TO "service_role";



GRANT ALL ON TABLE "public"."v_trainer_monthly_counts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




































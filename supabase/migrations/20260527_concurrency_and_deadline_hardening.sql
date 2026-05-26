-- ============================================================
-- Nebenläufigkeits- & Frist-Härtung (Review-Follow-ups)
-- ============================================================
-- 1. cancel_and_issue_token: 3-Stunden-Stornofrist server-seitig.
--    Bisher nur im Client geprüft -> ein konstruierter RPC-Call konnte
--    innerhalb der 3h trotzdem einen Nachhol-Token erzwingen.
-- 2. check_slot_capacity: COUNT->INSERT war nicht race-frei. Zwei
--    gleichzeitige Buchungen konnten dieselbe Kapazität überbuchen.
--    Advisory-Lock pro Slot serialisiert die Prüfung.
-- 3. trainer_videos: alte, überlappende Policies (Rolle public) entfernen.
-- ============================================================

-- 1. 3-Stunden-Frist
CREATE OR REPLACE FUNCTION public.cancel_and_issue_token(
  p_appointment_id uuid,
  p_skip_token     boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_appt            public.appointments%ROWTYPE;
  v_token           public.cancellation_tokens%ROWTYPE;
  v_category        text;
  v_is_admin        boolean;
  v_within_deadline boolean;
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

  -- 3-Stunden-Frist (Europe/Berlin): innerhalb der Frist storniert ein Kunde
  -- zwar weiterhin, erhält aber keinen Nachhol-Token.
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
$function$;

-- 2. Slot-Kapazität race-frei
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

  -- Gleichzeitige Buchungen desselben Slots serialisieren, damit die
  -- COUNT->Prüfung->INSERT-Sequenz nicht überbucht werden kann. Der Lock
  -- gilt transaktionsweit und wird bei COMMIT/ROLLBACK freigegeben.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.date::text || ' ' || NEW.time::text || ' ' || NEW.program, 0)
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
     AND ts.time             = NEW.time;

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
$function$;

-- 3. trainer_videos: veraltete public-Policies entfernen (Drift). Die
--    gehärteten trainer_videos_* (TO authenticated) decken denselben
--    Zugriff ab (is_admin OR auth.uid() = trainer_id).
DROP POLICY IF EXISTS admin_all        ON public.trainer_videos;
DROP POLICY IF EXISTS trainer_read_own ON public.trainer_videos;

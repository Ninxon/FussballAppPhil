-- ============================================================
-- Nachholtermin-Storno-Limit: Kunde darf einen Nachholtermin
-- maximal zweimal stornieren-und-neu-buchen, danach nur Admin.
-- ============================================================
-- Problem: Beim Stornieren stellt cancel_and_issue_token immer einen
-- neuen Token aus -- auch wenn der stornierte Termin selbst schon ein
-- Nachholtermin war. Dadurch konnte ein Kunde dieselbe Storno-Kette
-- endlos weiterdrehen (stornieren -> neuer Token -> neu buchen -> ...).
--
-- Loesung: Per-Token-Buchungen werden als Nachholtermin markiert
-- (is_makeup) und tragen einen Ketten-Zaehler (makeup_count). Ein Kunde
-- darf einen Nachholtermin nur stornieren, solange makeup_count < 2.
-- Admins koennen jederzeit stornieren; ein Admin-Storno eines
-- Nachholtermins stellt KEINEN neuen Token aus.
-- ============================================================

-- 1. Spalten
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_makeup   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS makeup_count int    NOT NULL DEFAULT 0;

ALTER TABLE public.cancellation_tokens
  ADD COLUMN IF NOT EXISTS makeup_count int NOT NULL DEFAULT 0;

-- 2. book_with_token: per Token gebuchter Termin ist ein Nachholtermin.
--    makeup_count wird vom verwendeten Token uebernommen.
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

-- 3. cancel_and_issue_token: Limit fuer Kunden + Admin stellt bei
--    Nachholtermin-Storno keinen neuen Token aus.
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
  v_appt     public.appointments%ROWTYPE;
  v_token    public.cancellation_tokens%ROWTYPE;
  v_category text;
  v_is_admin boolean;
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

  v_category := CASE v_appt.program
    WHEN 'individual'           THEN 'individual'
    WHEN 'torhueter_individual' THEN 'individual'
    ELSE 'gruppe'
  END;

  UPDATE public.appointments SET status = 'cancelled' WHERE id = p_appointment_id;

  -- Kein neuer Token, wenn: 3-Stunden-Frist (p_skip_token) ODER ein Admin
  -- einen Nachholtermin storniert (verhindert die Storno-Schleife).
  IF p_skip_token OR (v_appt.is_makeup AND v_is_admin) THEN
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

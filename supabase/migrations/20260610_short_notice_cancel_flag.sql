-- ============================================================
-- Kurzfristige Stornierung markieren (3-Stunden-Frist)
-- ============================================================
-- Die Betreiber moechten im Terminkalender erkennen koennen, wenn ein
-- KUNDE innerhalb der 3-Stunden-Frist storniert hat (kein Token-Anspruch),
-- um wiederholte Kurzfrist-Absagen nachzuverfolgen.
--
-- Loesung: ein boolescher Marker auf der appointments-Zeile, gesetzt
-- vom selben Deadline-Check, der bereits den Token unterdrueckt.
-- Admin-Stornos werden NICHT markiert (operator-initiiert).
-- ============================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS short_notice_cancel boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointments.short_notice_cancel IS
  'Kunde hat innerhalb der 3-Stunden-Frist storniert (Tracking im Terminkalender). Admin-Stornos bleiben false.';

CREATE OR REPLACE FUNCTION public.cancel_and_issue_token(p_appointment_id uuid, p_skip_token boolean DEFAULT false)
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

  IF v_appt.is_makeup AND NOT v_is_admin AND v_appt.makeup_count >= 2 THEN
    RETURN json_build_object('error',
      'Dieser Nachholtermin kann nicht mehr storniert werden. Bitte wende dich an deinen Trainer.');
  END IF;

  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.cancellation_tokens
       WHERE player_id  = v_appt.player_id
         AND used_at    IS NULL
         AND expires_at > NOW()
    ) INTO v_has_open_chain;

    IF v_has_open_chain THEN
      RETURN json_build_object('error',
        'Du hast noch einen offenen Gutschein. Bitte buche damit zuerst deinen Nachholtermin, bevor du einen weiteren Termin stornierst.');
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

  -- Kurzfrist-Storno eines Kunden fuer den Terminkalender markieren.
  -- Admin-Stornos bleiben unmarkiert (false).
  UPDATE public.appointments
     SET status = 'cancelled',
         short_notice_cancel = (v_within_deadline AND NOT v_is_admin)
   WHERE id = p_appointment_id;

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
$function$;

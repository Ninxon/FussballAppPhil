-- ============================================================
-- Token-Gültigkeit ab dem TERMIN-Datum statt ab dem Storno-Zeitpunkt.
-- ============================================================
-- Problem: cancel_and_issue_token setzte expires_at = NOW() + 1 Monat,
-- also gemessen ab dem Zeitpunkt der Stornierung. Wer einen Termin lange
-- im Voraus storniert (z. B. am 3. Juni einen Termin vom 18. Juni), hatte
-- dadurch effektiv weniger Zeit für den Nachholtermin (gültig nur bis 3. Juli).
--
-- Lösung: Die Gültigkeit wird ab dem Datum des stornierten Termins
-- gerechnet — ein Monat ab dem Termin, gültig bis zum Ende dieses Tages
-- (Europe/Berlin). Beispiel: Termin am 18. Juni → Token gültig bis 18. Juli.
-- Nur die expires_at-Berechnung ändert sich; alle übrigen Regeln (Frist,
-- offene-Kette, Nachhol-Limit, Admin-Sonderfälle) bleiben unverändert.
-- ============================================================

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
    v_appt.user_id, v_category,
    -- Gültigkeit ab dem TERMIN-Datum (nicht ab dem Storno-Zeitpunkt): ein Monat
    -- ab dem stornierten Termin, gültig bis zum Ende dieses Tages (Europe/Berlin).
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

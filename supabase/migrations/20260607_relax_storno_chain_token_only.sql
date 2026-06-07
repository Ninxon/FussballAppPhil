-- ============================================================
-- Storno-Ketten-Regel lockern: nur ein offener Gutschein blockt
-- ============================================================
-- Bisher konnte ein Kunde keinen Originaltermin stornieren, solange entweder ein
-- unbenutzter Token ODER ein zukünftiger, bereits gebuchter Nachholtermin offen
-- war. Letzteres wird entfernt: ein ausstehender Nachholtermin blockt nicht mehr.
-- Es blockt nur noch ein offener (unbenutzter, gültiger) Gutschein — der erst
-- eingelöst werden muss, damit sich keine Tokens stapeln. Der makeup_count-Cap
-- (max. 2 Nachhol-Stornos pro Kette), die 3-Stunden-Frist, Tageslimit und
-- Kapazität bleiben unverändert. Signatur unverändert (App-kompatibel).
-- ============================================================

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

  -- Nur ein offener Gutschein blockt das Stornieren eines Originaltermins:
  -- ein bereits gebuchter (zukünftiger) Nachholtermin blockt NICHT mehr.
  -- Nachhol-Stornos und Admin-Stornos sind ausgenommen.
  IF NOT v_appt.is_makeup AND NOT v_is_admin THEN
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

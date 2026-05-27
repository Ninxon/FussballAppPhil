-- ============================================================
-- Tageslimit-Race schließen (TOCTOU im 2-Termine-pro-Tag-Limit).
-- ============================================================
-- check_daily_booking_limit liest die Anzahl bestätigter Termine des Tages und
-- entscheidet dann. Zwei gleichzeitige Buchungen desselben Kunden am selben Tag
-- konnten beide den Stand "1" lesen und zusammen auf 3 Termine kommen — dieselbe
-- Lücke, die check_slot_capacity bereits per Advisory-Lock geschlossen hat.
--
-- Lösung: transaktionsgebundener Advisory-Lock auf (user_id, date). Konkurrierende
-- Inserts desselben Kunden am selben Tag serialisieren so und sehen einander.
-- Der Lock wird am Transaktionsende automatisch freigegeben.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_daily_booking_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
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
$function$;

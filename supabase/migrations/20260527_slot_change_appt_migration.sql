-- ============================================================
-- Trainer-Slot-Änderung: Termin-Standort konsistent halten.
-- ============================================================
-- Problem: trainer_schedules.location bestimmt im check_slot_capacity-Trigger,
-- wie viele Trainer einem Standort zugeordnet sind. appointments.location wird
-- beim Buchen aus dem damaligen Slot abgeleitet. Wenn der Admin einen Slot
-- nachträglich auf einen anderen Standort umstellt, driften die beiden
-- auseinander: existierende Buchungen liegen am alten Standort, der Trigger
-- zählt aber nur Trainer mit dem aktuellen Standort -> Slot wirkt
-- fälschlicherweise als ausgebucht und neue Buchungen werden mit
-- "Dieser Slot ist bereits ausgebucht." abgelehnt.
--
-- Lösung:
-- 1. AFTER UPDATE OF location auf trainer_schedules zieht zukünftige
--    bestätigte Termine desselben Trainers an dem (Wochentag, Uhrzeit)
--    automatisch auf den neuen Standort.
-- 2. BEFORE DELETE auf trainer_schedules blockt das Entfernen eines Slots,
--    solange noch zukünftige Termine darauf liegen — der Admin muss diese
--    vorher umbuchen oder stornieren.
-- ============================================================

-- 1. Termin-Migration bei Standort-Wechsel
CREATE OR REPLACE FUNCTION public.tg_trainer_schedules_migrate_appts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

DROP TRIGGER IF EXISTS trainer_schedules_migrate_appts ON public.trainer_schedules;
CREATE TRIGGER trainer_schedules_migrate_appts
  AFTER UPDATE ON public.trainer_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trainer_schedules_migrate_appts();

-- 2. Slot-Löschen blocken solange aktive Termine existieren
CREATE OR REPLACE FUNCTION public.tg_trainer_schedules_block_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

DROP TRIGGER IF EXISTS trainer_schedules_block_delete ON public.trainer_schedules;
CREATE TRIGGER trainer_schedules_block_delete
  BEFORE DELETE ON public.trainer_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trainer_schedules_block_delete();

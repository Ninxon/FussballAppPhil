-- ============================================================
-- Standort pro Zeitplan-Slot + Termin (additiv, rückwärtskompatibel).
-- ============================================================
-- Jeder trainer_schedules-Eintrag (= ein Slot) kann einem Standort zugeordnet
-- werden; der gebuchte Termin speichert seinen Standort. Beide Spalten sind
-- NULLABLE — bestehende Zeilen/Abläufe bleiben unverändert gültig. Der CHECK
-- erlaubt NULL, damit Altzeilen und der bisherige (standortlose) Flow weiter
-- funktionieren.
-- ============================================================
ALTER TABLE public.trainer_schedules
  ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS location text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_schedules_location_chk') THEN
    ALTER TABLE public.trainer_schedules
      ADD CONSTRAINT trainer_schedules_location_chk
      CHECK (location IS NULL OR location IN ('Rüsselsheim', 'Kelsterbach'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_location_chk') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_location_chk
      CHECK (location IS NULL OR location IN ('Rüsselsheim', 'Kelsterbach'));
  END IF;
END $$;

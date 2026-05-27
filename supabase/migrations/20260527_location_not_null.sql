-- ============================================================
-- Standort ist Pflicht pro Trainer-Slot.
-- ============================================================
-- Übergang abgeschlossen: jeder trainer_schedules-Eintrag hat einen Standort
-- (Rüsselsheim/Kelsterbach). Ein Slot ohne Standort ergibt fachlich keinen
-- Sinn — "Aus" wird im Admin-Zeitplan durch Löschen der Slot-Zeile abgebildet,
-- nicht durch eine standortlose Zeile. Wir erzwingen das jetzt auf DB-Ebene.
--
-- Voraussetzung (erfüllt vor dieser Migration): keine trainer_schedules-Zeile
-- mit location IS NULL; der eine verbliebene zukünftige Termin ohne location
-- wurde auf den Standort seines Slots gesetzt.
--
-- appointments.location bleibt NULLABLE: historische (vergangene) Termine
-- entstanden vor dem Standort-Feature und sollen gültig bleiben. Neue
-- Buchungen erhalten ihren Standort über den (jetzt immer gesetzten) Slot.
-- ============================================================

ALTER TABLE public.trainer_schedules
  DROP CONSTRAINT IF EXISTS trainer_schedules_location_chk;

ALTER TABLE public.trainer_schedules
  ALTER COLUMN location SET NOT NULL;

ALTER TABLE public.trainer_schedules
  ADD CONSTRAINT trainer_schedules_location_chk
  CHECK (location IN ('Rüsselsheim', 'Kelsterbach'));

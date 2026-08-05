-- ═══════════════════════════════════════════════════════════════════════════
-- Uhrzeit JE ZUWEISUNG (nicht je Paket)
-- ═══════════════════════════════════════════════════════════════════════════
-- Dasselbe Paket kann bei Trainer A um 16:00 und bei Trainer B um 18:00
-- laufen. Die Zeit gehoert deshalb an die Verteilungszeile, nicht an
-- video_packages.
--
-- Kein Datum: es ist die wiederkehrende Trainingszeit der Einheit, kein
-- Termin — dafuer gibt es appointments. Die waehlbaren Werte kommen im
-- Frontend aus SLOTS (src/constants/slots.ts), derselben Liste, aus der
-- Termine gebucht werden.
--
-- Typ 'time without time zone' wie appointments.time und
-- trainer_schedules.time (Projektstandard seit
-- 20260521_migrate_date_time_native_types.sql). Bewusst NULLable:
-- bestehende Zuweisungen haben keine Zeit, und nicht jedes Paket gehoert
-- an eine feste Uhrzeit.
--
-- RLS: nichts zu tun. video_package_trainers_select ist eine ZEILEN-Policy
-- (is_admin() OR trainer_id = auth.uid()) und deckt neue Spalten
-- automatisch ab; die GRANTs in 20260803 sind tabellenweit, nicht
-- spaltenweise. Kein Index — es wird nie nach der Uhrzeit gefiltert.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.video_package_trainers
  ADD COLUMN IF NOT EXISTS scheduled_time time;

COMMENT ON COLUMN public.video_package_trainers.scheduled_time IS
  'Optionale Uhrzeit (HH:MM, ohne Datum) genau dieser Zuweisung. NULL = keine Zeit hinterlegt.';

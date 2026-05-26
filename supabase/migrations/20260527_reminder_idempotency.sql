-- ============================================================
-- Idempotenz für send-reminders: pro Termin merken, wann die
-- Erinnerung verschickt wurde, damit ein Re-Trigger (Cron-Retry,
-- manueller Aufruf) keine Doppel-Mails versendet.
-- ============================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Schlanker Index für die tägliche Auswahl
--   WHERE date = <morgen> AND status = 'confirmed' AND reminder_sent_at IS NULL
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_pending
  ON public.appointments(date)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;

-- ============================================================
-- Deckende Indizes für die Foreign Keys auf trainer_videos.
-- ============================================================
-- Performance-Advisor (0001_unindexed_foreign_keys): FK-Spalten ohne Index
-- können JOINs und v. a. ON DELETE/UPDATE-Prüfungen verlangsamen (z. B. beim
-- Löschen eines Trainers wird trainer_videos.trainer_id referenziell geprüft).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_trainer_videos_trainer_id
  ON public.trainer_videos(trainer_id);

CREATE INDEX IF NOT EXISTS idx_trainer_videos_created_by
  ON public.trainer_videos(created_by);

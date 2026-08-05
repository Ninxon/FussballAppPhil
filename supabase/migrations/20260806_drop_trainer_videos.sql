-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6: trainer_videos abbauen
-- ═══════════════════════════════════════════════════════════════════════════
-- Das alte Modell (ein Video gehoert genau EINEM Trainer) ist vollstaendig
-- durch videos / video_packages / video_package_items / video_package_trainers
-- ersetzt, siehe 20260803_video_packages.sql. Beide Oberflaechen laufen auf
-- dem neuen Modell; der zugehoerige TrainerVideosScreen wird im selben Commit
-- geloescht (er war bereits vorher nirgends mehr importiert).
--
-- Mit der Tabelle verschwinden automatisch:
--   * Policies trainer_videos_select / _insert / _update / _delete
--   * Indizes idx_trainer_videos_trainer_id, idx_trainer_videos_created_by
--   * die Foreign Keys auf profiles(id)
--
-- Bewusst OHNE CASCADE: gaebe es wider Erwarten einen Abhaengigen (View, FK
-- einer anderen Tabelle), soll die Migration abbrechen statt ihn lautlos
-- mitzuloeschen.
--
-- Der Backfill in 20260803_video_packages.sql prueft to_regclass und ist
-- danach ein No-Op — jene Datei bleibt also gefahrlos wiederholbar.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.trainer_videos') IS NULL THEN
    RAISE NOTICE 'trainer_videos existiert nicht mehr - nichts zu tun.';
    RETURN;
  END IF;

  -- Sicherung gegen den Fall, dass doch noch jemand in die alte Tabelle
  -- geschrieben hat. Lieber abbrechen als Daten verlieren.
  EXECUTE 'SELECT count(*) FROM public.trainer_videos' INTO v_rows;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'trainer_videos enthaelt % Zeile(n) - Abbruch, bitte erst pruefen.', v_rows;
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.trainer_videos;

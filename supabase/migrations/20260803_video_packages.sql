-- ═══════════════════════════════════════════════════════════════════════════
-- Video-Pakete: Bibliothek + Pakete + Zuweisung an Trainer
-- ═══════════════════════════════════════════════════════════════════════════
-- Bisher gehoerte ein Video genau EINEM Trainer (trainer_videos.trainer_id).
-- Dasselbe Video an 10 Trainer zu verteilen bedeutete 10 Uploads derselben
-- Datei. Neu:
--
--   videos                  = Bibliothek, gehoert niemandem
--   video_packages          = dauerhaft gespeicherte Zusammenstellung
--   video_package_items     = welche Videos liegen im Paket (M:N)
--   video_package_trainers  = wer bekommt das Paket (M:N)
--
-- Inhalt und Verteilung sind bewusst getrennte Tabellen: ein Paket wird
-- einmal gebaut und beliebig oft zugewiesen, ohne dass Dateien erneut
-- abgelegt werden. Das ist zugleich der Speicherhebel.
--
-- trainer_videos bleibt in dieser Migration unangetastet (Abbau erst, wenn
-- beide UIs auf dem neuen Modell laufen).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tabellen ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.videos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  url               text,          -- externer Link (YouTube/Vimeo/Direkt-URL)
  storage_path      text,          -- Objekt im Bucket 'trainer-videos'
  mime_type         text,
  size_bytes        bigint,
  original_filename text,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT videos_source_present CHECK (url IS NOT NULL OR storage_path IS NOT NULL)
);

COMMENT ON TABLE  public.videos IS 'Video-Bibliothek. Gehoert keinem Trainer; Sichtbarkeit ergibt sich aus der Paket-Zuweisung.';
COMMENT ON COLUMN public.videos.storage_path IS 'NULL = externer Link (url), sonst Objektpfad im Bucket trainer-videos.';

CREATE TABLE IF NOT EXISTS public.video_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.video_packages IS 'Dauerhaft gespeicherte Zusammenstellung von Videos. Existiert unabhaengig davon, ob ihr aktuell Trainer zugewiesen sind.';

CREATE TABLE IF NOT EXISTS public.video_package_items (
  package_id uuid NOT NULL REFERENCES public.video_packages(id) ON DELETE CASCADE,
  video_id   uuid NOT NULL REFERENCES public.videos(id)         ON DELETE CASCADE,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, video_id)
);

COMMENT ON TABLE public.video_package_items IS 'Inhalt eines Pakets. M:N, damit dasselbe Video ohne zweiten Upload in mehreren Paketen liegen kann.';

CREATE TABLE IF NOT EXISTS public.video_package_trainers (
  package_id  uuid NOT NULL REFERENCES public.video_packages(id) ON DELETE CASCADE,
  trainer_id  uuid NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, trainer_id)
);

COMMENT ON TABLE public.video_package_trainers IS 'Verteilung eines Pakets. Zeile entfernen = Zugriff entziehen; Paket und Videos bleiben bestehen.';

-- ── Indizes (FK-Deckung, vgl. 20260527_trainer_videos_fk_indexes) ─────────

-- Garantiert "eine videos-Zeile <-> ein Storage-Objekt". Macht die
-- Verwaisten-Erkennung in get_video_storage_usage() exakt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_storage_path
  ON public.videos(storage_path) WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_videos_created_by         ON public.videos(created_by);
CREATE INDEX IF NOT EXISTS idx_video_packages_created_by ON public.video_packages(created_by);
CREATE INDEX IF NOT EXISTS idx_vpi_video_id              ON public.video_package_items(video_id);
CREATE INDEX IF NOT EXISTS idx_vpt_trainer_id            ON public.video_package_trainers(trainer_id);
CREATE INDEX IF NOT EXISTS idx_vpt_assigned_by           ON public.video_package_trainers(assigned_by);

-- ── Sichtbarkeits-Helfer ──────────────────────────────────────────────────
-- Kapselt den Join, damit ihn nicht drei Policies duplizieren. SECURITY
-- DEFINER, damit die Policy-Auswertung nicht ihrerseits RLS auf
-- video_package_trainers ausloest (Rekursion).

CREATE OR REPLACE FUNCTION public.is_package_visible(p_package_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.video_package_trainers t
    WHERE t.package_id = p_package_id
      AND t.trainer_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.is_package_visible(uuid) IS '@omit';
REVOKE EXECUTE ON FUNCTION public.is_package_visible(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_package_visible(uuid) TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Trainer LESEN nur, was ihnen zugewiesen ist. Alle Schreibrechte nur Admin.

ALTER TABLE public.videos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_packages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_package_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_package_trainers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_packages_select" ON public.video_packages;
DROP POLICY IF EXISTS "video_packages_write"  ON public.video_packages;

CREATE POLICY "video_packages_select" ON public.video_packages
  FOR SELECT TO authenticated
  USING (public.is_package_visible(id));

CREATE POLICY "video_packages_write" ON public.video_packages
  FOR ALL TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "video_package_items_select" ON public.video_package_items;
DROP POLICY IF EXISTS "video_package_items_write"  ON public.video_package_items;

CREATE POLICY "video_package_items_select" ON public.video_package_items
  FOR SELECT TO authenticated
  USING (public.is_package_visible(package_id));

CREATE POLICY "video_package_items_write" ON public.video_package_items
  FOR ALL TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "videos_select" ON public.videos;
DROP POLICY IF EXISTS "videos_write"  ON public.videos;

-- Ein Video ist sichtbar, sobald es in MINDESTENS einem zugewiesenen Paket liegt.
CREATE POLICY "videos_select" ON public.videos
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1
      FROM public.video_package_items i
      JOIN public.video_package_trainers t ON t.package_id = i.package_id
      WHERE i.video_id = public.videos.id
        AND t.trainer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "videos_write" ON public.videos
  FOR ALL TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "video_package_trainers_select" ON public.video_package_trainers;
DROP POLICY IF EXISTS "video_package_trainers_write"  ON public.video_package_trainers;

CREATE POLICY "video_package_trainers_select" ON public.video_package_trainers
  FOR SELECT TO authenticated
  USING ((select public.is_admin()) OR trainer_id = (SELECT auth.uid()));

CREATE POLICY "video_package_trainers_write" ON public.video_package_trainers
  FOR ALL TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.videos, public.video_packages,
     public.video_package_items, public.video_package_trainers
  TO authenticated;

GRANT ALL
  ON public.videos, public.video_packages,
     public.video_package_items, public.video_package_trainers
  TO service_role;

-- ── Speicherbelegung (Datenquelle der Admin-Anzeige) ──────────────────────

CREATE OR REPLACE FUNCTION public.get_video_storage_usage()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_files        bigint;
  v_bytes        bigint;
  v_orphans      bigint;
  v_orphan_bytes bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Admins duerfen die Speicherbelegung abfragen.';
  END IF;

  SELECT count(*), coalesce(sum((o.metadata->>'size')::bigint), 0)
    INTO v_files, v_bytes
    FROM storage.objects o
   WHERE o.bucket_id = 'trainer-videos';

  -- Verwaist = Datei im Bucket ohne zugehoerige videos-Zeile. Entsteht durch
  -- abgebrochene Uploads und durch delete-trainer (loescht nur DB-Zeilen).
  SELECT count(*), coalesce(sum((o.metadata->>'size')::bigint), 0)
    INTO v_orphans, v_orphan_bytes
    FROM storage.objects o
   WHERE o.bucket_id = 'trainer-videos'
     AND NOT EXISTS (
       SELECT 1 FROM public.videos v WHERE v.storage_path = o.name
     );

  RETURN json_build_object(
    'file_count',   v_files,
    'total_bytes',  v_bytes,
    'orphan_count', v_orphans,
    'orphan_bytes', v_orphan_bytes
  );
END;
$$;

COMMENT ON FUNCTION public.get_video_storage_usage() IS '@omit';
REVOKE EXECUTE ON FUNCTION public.get_video_storage_usage() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_video_storage_usage() TO authenticated;

-- ── Backfill: bestehende trainer_videos uebernehmen ───────────────────────
-- Je Trainer mit Videos entsteht ein Paket "Bestehende Videos", das ihm
-- zugewiesen wird. Trainer sehen danach exakt dasselbe wie vorher.
-- trainer_videos.id wird als videos.id uebernommen -> Zuordnung bleibt
-- nachvollziehbar. Idempotent: laeuft die Migration erneut, passiert nichts.

DO $$
DECLARE
  r      record;
  v_pkg  uuid;
  v_row  record;
  v_pos  int;
BEGIN
  IF to_regclass('public.trainer_videos') IS NULL THEN
    RAISE NOTICE 'trainer_videos existiert nicht - Backfill uebersprungen.';
    RETURN;
  END IF;

  -- Schon migriert? Dann nichts tun.
  IF EXISTS (SELECT 1 FROM public.video_package_items) THEN
    RAISE NOTICE 'video_package_items ist nicht leer - Backfill uebersprungen.';
    RETURN;
  END IF;

  FOR r IN SELECT DISTINCT trainer_id FROM public.trainer_videos LOOP
    INSERT INTO public.video_packages (title, description)
    VALUES ('Bestehende Videos', 'Automatisch aus den bisherigen Trainer-Videos uebernommen.')
    RETURNING id INTO v_pkg;

    INSERT INTO public.video_package_trainers (package_id, trainer_id)
    VALUES (v_pkg, r.trainer_id)
    ON CONFLICT DO NOTHING;

    v_pos := 0;
    FOR v_row IN
      SELECT id, title, description, url, storage_path, created_by, created_at
        FROM public.trainer_videos
       WHERE trainer_id = r.trainer_id
       ORDER BY created_at
    LOOP
      -- Bei hochgeladenen Dateien wird url geleert: storage_path ist dann die
      -- einzige Quelle. Das macht die spaetere Umstellung auf einen privaten
      -- Bucket zum Nicht-Ereignis (die gespeicherte Public-URL wuerde sonst
      -- weiterverwendet und ins Leere zeigen).
      INSERT INTO public.videos (id, title, description, url, storage_path, created_by, created_at)
      VALUES (
        v_row.id,
        v_row.title,
        v_row.description,
        CASE WHEN v_row.storage_path IS NULL THEN v_row.url ELSE NULL END,
        v_row.storage_path,
        v_row.created_by,
        v_row.created_at
      )
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.video_package_items (package_id, video_id, position)
      VALUES (v_pkg, v_row.id, v_pos)
      ON CONFLICT DO NOTHING;

      v_pos := v_pos + 1;
    END LOOP;
  END LOOP;
END;
$$;

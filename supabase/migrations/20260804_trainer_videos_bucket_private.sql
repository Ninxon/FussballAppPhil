-- ═══════════════════════════════════════════════════════════════════════════
-- Bucket 'trainer-videos' abriegeln: privat + Zugriff ueber signierte Links
-- ═══════════════════════════════════════════════════════════════════════════
-- Bisher ist der Bucket oeffentlich: wer die URL kennt, sieht das Video ohne
-- Login, die Links sind nicht widerrufbar, und fremdes Einbetten geht auf das
-- eigene Traffic-Kontingent. Zielgruppe sind ausschliesslich eingeloggte
-- Trainer, daher wird der Bucket privat.
--
-- Das Frontend ist darauf vorbereitet: resolvePlaybackUrl()
-- (src/services/videoService.ts) prueft storage_path zuerst und erzeugt einen
-- signierten Link. Fuer die App aendert sich dadurch nichts.
--
-- WICHTIG: Ein oeffentlicher Bucket liest an RLS vorbei — deshalb gab es bis
-- jetzt gar keine SELECT-Policy. Ohne die untenstehende koennte nach der
-- Umstellung NIEMAND mehr lesen, auch der Admin nicht.
--
-- Vorab geprueft (2026-08-04): CREATE POLICY auf storage.objects und UPDATE
-- auf storage.buckets sind mit dieser Verbindung moeglich. Der Bucket ist
-- leer (0 Dateien), es koennen also keine bereits geteilten Links brechen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Bucket-Einstellungen ──────────────────────────────────────────────────
-- file_size_limit auf 200 MB: das Frontend prueft bereits gegen diesen Wert
-- (MAX_UPLOAD_BYTES in src/admin/services/videoValidation.ts). Bisher stand
-- der Bucket auf 50 MB — eine 120-MB-Datei waere im Client durchgegangen und
-- erst beim Upload gescheitert.
UPDATE storage.buckets
   SET public             = false,
       file_size_limit    = 209715200,
       allowed_mime_types = ARRAY[
         'video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska'
       ]
 WHERE id = 'trainer-videos';

-- ── Policies ──────────────────────────────────────────────────────────────
-- Die drei bestehenden Admin-Policies werden identisch neu angelegt, damit
-- diese Datei die Quelle der Wahrheit ist (bisher lebten sie nur im
-- Dashboard). Neu hinzu kommt die SELECT-Policy.

DROP POLICY IF EXISTS "trainer_videos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "trainer_videos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "trainer_videos_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "trainer_videos_read"         ON storage.objects;

CREATE POLICY "trainer_videos_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trainer-videos' AND (select public.is_admin()));

CREATE POLICY "trainer_videos_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'trainer-videos' AND (select public.is_admin()))
  WITH CHECK (bucket_id = 'trainer-videos' AND (select public.is_admin()));

CREATE POLICY "trainer_videos_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'trainer-videos' AND (select public.is_admin()));

-- Lesen (und damit Signieren) darf:
--   * der Admin alles im Bucket
--   * ein Trainer genau die Dateien, die zu einem Video in einem ihm
--     zugewiesenen Paket gehoeren
-- createSignedUrl setzt SELECT auf das Objekt voraus — diese Policy ist also
-- exakt das Tor zur Wiedergabe.
CREATE POLICY "trainer_videos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'trainer-videos'
    AND (
      (select public.is_admin())
      OR EXISTS (
        SELECT 1
        FROM public.videos v
        JOIN public.video_package_items    i ON i.video_id   = v.id
        JOIN public.video_package_trainers t ON t.package_id = i.package_id
        WHERE v.storage_path = storage.objects.name
          AND t.trainer_id = (select auth.uid())
      )
    )
  );

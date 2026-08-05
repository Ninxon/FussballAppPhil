-- ═══════════════════════════════════════════════════════════════════════════
-- Globaler Reset der Verteilung
-- ═══════════════════════════════════════════════════════════════════════════
-- Entfernt ALLE Zuweisungen aller Pakete inklusive der Uhrzeiten. Pakete,
-- Paketinhalte, Videos und Dateien bleiben unberuehrt — geloescht wird
-- ausschliesslich video_package_trainers.
--
-- Warum eine RPC und kein DELETE aus dem Client: RLS filtert lautlos. Ein
-- Nicht-Admin bekaeme sonst "erfolgreich, 0 Zeilen" statt einer
-- Fehlermeldung — ein zerstoererischer Button, der bei fehlender
-- Berechtigung "OK" meldet, ist die schlechtere Variante. Zusaetzlich
-- liefert die Funktion die Anzahl entfernter Zuweisungen fuer die
-- Rueckmeldung im UI.
--
-- Muster identisch zu get_video_storage_usage() in
-- 20260803_video_packages.sql: SECURITY DEFINER + explizite is_admin()-Pruefung
-- + leerer search_path + REVOKE/GRANT.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reset_all_package_assignments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_removed integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Admins duerfen die Verteilung zuruecksetzen.';
  END IF;

  WITH deleted AS (
    DELETE FROM public.video_package_trainers RETURNING 1
  )
  SELECT count(*)::integer INTO v_removed FROM deleted;

  RETURN v_removed;
END;
$$;

COMMENT ON FUNCTION public.reset_all_package_assignments() IS '@omit';
REVOKE EXECUTE ON FUNCTION public.reset_all_package_assignments() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_all_package_assignments() TO authenticated;

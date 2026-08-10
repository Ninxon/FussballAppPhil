-- ============================================================
-- Fix: Gruppen-Kompatibilitätsprüfung war für Termine ohne Snapshot blind.
-- ============================================================
-- Vorfall 21.08.2026: ein Experte (Jg. 2014) und ein Amateur (Jg. 2019) saßen
-- beim selben Trainer in einer Gruppe. Beide waren Nachholtermine mit
-- location = NULL. Die Prüfung im Client filtert bestehende Spieler nach exakt
-- gleichem Standort — Termine ohne Standort fielen heraus, die Gruppe wirkte
-- leer und nahm jeden auf.
--
-- Diese Migration schließt die DB-seitigen Anteile:
--   1) Bestandsdaten: fehlende Standorte aus dem Trainer-Slot nachtragen
--   2) get_slot_players(): Termine ohne Jahrgang nicht mehr verschweigen
--
-- Der Client behandelt fehlende Angaben ab sofort als "inkompatibel" statt sie
-- zu überspringen (siehe bookingRules.checkGroupSessionCompatibility). Damit das
-- greifen KANN, muss die RPC solche Zeilen ausliefern — bisher hat sie sie
-- gefiltert, wodurch der Client sie gar nicht sehen konnte.
-- ============================================================

-- ── 1) Bestandsdaten ────────────────────────────────────────────────────────
-- Der Standort hängt am trainer_schedules-Slot (dort NOT NULL). Für Termine mit
-- Trainer lässt er sich eindeutig rekonstruieren: gleicher Trainer, gleicher
-- Wochentag, gleiche Uhrzeit. Termine ohne Trainer bleiben unangetastet.
UPDATE public.appointments a
SET location = ts.location
FROM public.trainer_schedules ts
WHERE a.location IS NULL
  AND a.trainer_id = ts.trainer_id
  AND ts.day_of_week = CASE EXTRACT(DOW FROM a.date)::int
                         WHEN 0 THEN 7
                         ELSE EXTRACT(DOW FROM a.date)::int
                       END
  AND ts.time = a.time;

-- ── 2) get_slot_players ohne blinden Filter ─────────────────────────────────
-- Bisher: "AND a.session_birth_year IS NOT NULL" — Termine ohne Jahrgang waren
-- für die Kapazitäts- UND Kompatibilitätsanzeige unsichtbar. Genau diese Zeilen
-- muss der Client sehen, um die Gruppe zu blockieren. Die Funktion bleibt
-- anonym: sie gibt weiterhin nur Jahrgang und Stufe zurück, keine Namen.
CREATE OR REPLACE FUNCTION public.get_slot_players()
RETURNS TABLE(date text, "time" text, program text, location text, session_birth_year int, session_level text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT a.date::text, to_char(a.time, 'HH24:MI'), a.program, a.location, a.session_birth_year, a.session_level, a.created_at
  FROM public.appointments a
  WHERE a.status = 'confirmed';
$$;
COMMENT ON FUNCTION public.get_slot_players() IS '@omit';

-- ── Offen (bewusst nicht in dieser Migration) ───────────────────────────────
-- Die Alters-/Level-Regel lebt weiterhin ausschließlich im Client. Kapazität,
-- Tageslimit und Trainerverfügbarkeit sind serverseitig abgesichert, diese Regel
-- nicht — book_with_token schreibt den Snapshot, prüft ihn aber nie. Solange das
-- so ist, ist jeder Schutz hier eine UI-Konvention, keine Garantie.

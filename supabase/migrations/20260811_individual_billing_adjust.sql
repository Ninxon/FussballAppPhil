-- ============================================================
-- Manuelle Korrektur des Einzeltraining-Zaehlers
-- ============================================================
-- Der 4er-Zaehler ist bisher rein abgeleitet: Termine seit
-- players.individual_billed_since. Fuer Spezialfaelle (Einheit ausserhalb der
-- App gehalten, Kulanz, Barzahlung am Platz) fehlte den Betreibern eine
-- Moeglichkeit, den Stand von Hand zu korrigieren.
--
-- Loesung ist ein Offset statt eines gespeicherten Zaehlers: die Ableitung
-- bleibt die Wahrheit, der Offset verschiebt sie nur. Damit zaehlen neue
-- Termine weiterhin automatisch mit, auch nach einer Korrektur.
--
-- Der Offset gehoert zum laufenden Block und wird beim "Ist bezahlt" zusammen
-- mit dem Stichtag zurueckgesetzt (im Client, eine UPDATE-Anweisung).
--
-- Schreibrechte: players_update ist bereits admin-only
-- (USING/WITH CHECK = is_admin()), die Spalte erbt das. Kunden koennen players
-- ueberhaupt nicht schreiben — hier ist nichts zusaetzlich abzusichern.
-- ============================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS individual_billing_adjust integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.players.individual_billing_adjust IS
  'Manuelle Korrektur des laufenden Einzeltraining-Blocks (+/-). Wird auf die aus den Terminen abgeleiteten Einheiten addiert; die Summe wird bei 0 abgefangen. Gilt nur fuer den laufenden Block und wird mit individual_billed_since zurueckgesetzt.';

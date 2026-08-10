-- Einzeltraining-Abrechnung: Stichtag der letzten Abrechnung je Spieler.
--
-- Die Betreiber rechnen Einzeltrainings nach je 4 absolvierten Einheiten ab und
-- konnten den Stand bisher nirgends ablesen. Der Admin sieht im Kundendetail den
-- laufenden 4er-Block und hakt "Ist bezahlt" ab -> dieser Stichtag wandert auf
-- heute, der Zaehler startet neu. Reine Merkhilfe: keine Buchungssperre, kein
-- Guthaben, keine Rechnungslogik.
--
-- Der DEFAULT fuellt alle Bestandszeilen mit dem Deploy-Datum. Damit zaehlt der
-- Zaehler wie gewuenscht erst ab jetzt, ohne dass die vorhandene Terminhistorie
-- (Monate an Alt-Terminen) zu unbrauchbar hohen Startwerten fuehrt.
--
-- Zeitzone explizit Europe/Berlin, weil die DB in UTC laeuft und der Rest des
-- Schemas (z. B. cancel_and_issue_token) ebenfalls in Berliner Zeit rechnet.
--
-- RLS: players_update erlaubt UPDATE ausschliesslich is_admin(); eine
-- Eltern-Update-Policy auf players existiert nicht. Die Spalte ist damit
-- automatisch admin-only schreibbar, ein Guard-Trigger ist nicht noetig.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS individual_billed_since date
    NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Berlin')::date;

COMMENT ON COLUMN public.players.individual_billed_since IS
  'Stichtag der letzten Einzeltraining-Abrechnung. Einheiten ab diesem Datum zaehlen in den laufenden 4er-Block (individual + torhueter_individual). Merkhilfe fuer den Admin, keine Buchungssperre.';

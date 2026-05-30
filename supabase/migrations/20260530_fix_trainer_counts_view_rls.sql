-- Sicherheitsfix für v_trainer_monthly_counts
--
-- Die View aus 20260529_trainer_monthly_counts.sql lief mit dem Standard
-- security_invoker = false, d. h. mit den Rechten des View-Owners (postgres).
-- Dadurch wurde die RLS der Basistabelle public.appointments NICHT auf den
-- abfragenden Nutzer angewendet — ein eingeloggter Kunde (und ggf. anon)
-- konnte die View direkt per REST (/rest/v1/v_trainer_monthly_counts) lesen
-- und so den is_admin()-Check der RPC get_trainer_monthly_counts() umgehen.
-- Geleakt würden Aggregate (trainer_id, Monat, Anzahl Sessions) — keine PII,
-- aber dennoch ein ungewollter Bypass des Admin-only-Konzepts.
--
-- Fix:
-- 1) security_invoker = on  -> die View wendet die RLS des Fragenden an.
--    Admins (dürfen alle appointments lesen) sehen alles, Kunden/anon nichts.
-- 2) Direktzugriff für anon/authenticated entziehen — Zugriff läuft
--    ausschließlich über die abgesicherte SECURITY-DEFINER-RPC.

ALTER VIEW public.v_trainer_monthly_counts SET (security_invoker = on);

REVOKE ALL ON public.v_trainer_monthly_counts FROM anon, authenticated;

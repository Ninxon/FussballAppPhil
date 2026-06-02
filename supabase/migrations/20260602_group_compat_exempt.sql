-- ============================================================
-- Feature: Admin-Override der Gruppen-Alters-/Level-Prüfung pro Spieler.
-- ============================================================
-- Manche Spieler sollen (lang- oder kurzfristig) in Gruppen gebucht werden
-- können, die die normale Alters-/Level-Kompatibilität (canJoinGroupSlot)
-- ablehnt. Dieses Flag befreit einen Spieler dauerhaft von dieser EINEN
-- Prüfung — ausschließlich im Admin-Buchungspfad (validateBooking).
-- Kapazität, Tageslimit, Trainer-Verfügbarkeit und can_book_* bleiben aktiv.
-- Die Kundensicht liest das Flag nicht.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skip_group_age_level_check boolean NOT NULL DEFAULT false;

-- Self-Update-Guard erweitern: das neue Flag darf NUR ein Admin setzen,
-- sonst könnte sich ein Kunde per direktem PostgREST-Call selbst befreien.
-- (Spaltenwächter blockt nur gelistete Felder — neue Spalte muss rein.)
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT (SELECT public.is_admin()) THEN
    IF NEW.id                            IS DISTINCT FROM OLD.id
    OR NEW.full_name                     IS DISTINCT FROM OLD.full_name
    OR NEW.email                         IS DISTINCT FROM OLD.email
    OR NEW.birth_date                    IS DISTINCT FROM OLD.birth_date
    OR NEW.address                       IS DISTINCT FROM OLD.address
    OR NEW.customer_number               IS DISTINCT FROM OLD.customer_number
    OR NEW.is_active                     IS DISTINCT FROM OLD.is_active
    OR NEW.role                          IS DISTINCT FROM OLD.role
    OR NEW.level                         IS DISTINCT FROM OLD.level
    OR NEW.can_book_individual           IS DISTINCT FROM OLD.can_book_individual
    OR NEW.can_book_gruppe               IS DISTINCT FROM OLD.can_book_gruppe
    OR NEW.can_book_athletik             IS DISTINCT FROM OLD.can_book_athletik
    OR NEW.can_book_torhueter_individual IS DISTINCT FROM OLD.can_book_torhueter_individual
    OR NEW.can_book_torhueter_gruppe     IS DISTINCT FROM OLD.can_book_torhueter_gruppe
    OR NEW.player_type                   IS DISTINCT FROM OLD.player_type
    OR NEW.parent_name                   IS DISTINCT FROM OLD.parent_name
    OR NEW.trainer_specialty             IS DISTINCT FROM OLD.trainer_specialty
    OR NEW.skip_group_age_level_check    IS DISTINCT FROM OLD.skip_group_age_level_check
    THEN
      RAISE EXCEPTION 'Nur ein Admin darf dieses Profilfeld ändern.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

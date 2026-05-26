-- ============================================================
-- SECURITY: Selbst-Update von profiles auf sichere Spalten begrenzen.
-- ============================================================
-- Die RLS-Policy profiles_update erlaubt `auth.uid() = id`, also darf ein
-- Kunde seine eigene Profilzeile updaten. RLS ist aber NICHT spalten-genau —
-- ein Kunde könnte per direktem PostgREST-Call role='admin' setzen oder sich
-- can_book_* freischalten (Privilege Escalation). RLS allein kann das nicht
-- verhindern, daher ein BEFORE-UPDATE-Trigger als Spaltenwächter.
--
-- Regel: authentifizierte Nicht-Admins dürfen an IHREM Profil nur `phone` und
-- `location` ändern. Admins (is_admin) und Service-Role (auth.uid() IS NULL,
-- bypassed RLS ohnehin) bleiben unberührt.
-- ============================================================
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
    THEN
      RAISE EXCEPTION 'Nur ein Admin darf dieses Profilfeld ändern.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_self_update ON public.profiles;
CREATE TRIGGER guard_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

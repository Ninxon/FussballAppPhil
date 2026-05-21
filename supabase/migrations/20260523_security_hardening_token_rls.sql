-- ============================================================
-- Security hardening: enforce the token-only booking model in RLS
-- ============================================================
-- The business rule is "customers may only book via a cancellation token".
-- That was enforced ONLY in the client and in book_with_token. The RLS
-- write policies still let an authenticated customer call the REST API
-- directly with their own JWT and:
--   • insert a confirmed appointment without any token,
--   • forge unlimited tokens pointing at one cancelled appointment,
--   • reset used_at / extend expires_at to reuse a token,
--   • edit/rebook their own appointments.
--
-- Fix: customer self-service writes go EXCLUSIVELY through the SECURITY
-- DEFINER functions book_with_token / cancel_and_issue_token. Both are
-- owned by `postgres` and the tables have FORCE ROW LEVEL SECURITY = off,
-- so those functions bypass these policies. Direct customer writes are
-- therefore restricted to admins; the functions keep working unchanged.
-- ============================================================

-- 1. The cancel function must bypass RLS like book_with_token already does.
--    It already validates ownership internally (auth.uid() = user_id OR is_admin()),
--    and auth.uid() still reflects the calling user under SECURITY DEFINER.
ALTER FUNCTION public.cancel_and_issue_token(uuid, boolean) SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.cancel_and_issue_token(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_and_issue_token(uuid, boolean) TO authenticated;

-- 2. appointments: only admins may write directly. Customers book via
--    book_with_token; cancellations go through cancel_and_issue_token.
ALTER POLICY appointments_insert ON public.appointments
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY appointments_update ON public.appointments
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- 3. cancellation_tokens: only admins / the functions may write. This kills
--    both token forgery (insert) and token reuse (update used_at).
ALTER POLICY tokens_insert ON public.cancellation_tokens
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY tokens_update ON public.cancellation_tokens
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- 4. Slot RPCs expose anonymized booking data — restrict to signed-in users.
REVOKE EXECUTE ON FUNCTION public.get_slot_counts()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_slot_players() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_slot_counts()  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_slot_players() TO authenticated;

-- 5. book_with_token can never succeed for anon (no auth.uid()); drop the exposure.
REVOKE EXECUTE ON FUNCTION public.book_with_token(uuid, date, time, text) FROM PUBLIC, anon;

-- 6. rls_auto_enable is an event-trigger helper, not an API endpoint.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 7. Storage: drop the broad public listing policy on the trainer-videos bucket.
--    Public-URL playback (getPublicUrl) does not need it; this only stops
--    clients from enumerating every file in the bucket.
DROP POLICY IF EXISTS trainer_videos_public_read ON storage.objects;

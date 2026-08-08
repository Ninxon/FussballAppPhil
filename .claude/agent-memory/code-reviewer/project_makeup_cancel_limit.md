---
name: makeup-cancel-limit
description: Makeup cancellation limit semantics + the off-by-one and missing server-side weekend/holiday guard found in commit 7831a9f
metadata:
  type: project
---

Commit 7831a9f added a "makeup cancellation limit" to stop customers looping cancel->rebook forever. Authoritative SQL: `supabase/migrations/20260526_makeup_cancel_limit.sql`.

Mechanics:
- `appointments.is_makeup` (bool) + `appointments.makeup_count` (int); `cancellation_tokens.makeup_count` (int).
- `book_with_token` sets is_makeup=true, copies makeup_count from the token used.
- `cancel_and_issue_token`: customer blocked when `is_makeup AND makeup_count >= 2`; admin bypasses; admin cancel of a makeup issues NO token (breaks the loop). Issued token's makeup_count = was_makeup ? appt.makeup_count+1 : 0.

**Why:** Intent (comments :12, :149) says customer may cancel-and-rebook a makeup "maximal zweimal" (count 0 und 1).

**How to apply (known issues to re-verify before trusting the limit):**
- Off-by-one: `>= 2` actually permits 3 makeup bookings, not 2. Flag unless spec is confirmed to mean 3.
- `book_with_token` has NO server-side weekend/holiday guard; `isBookableDay`/`germanHolidays` in `src/utils/bookingRules.ts` are client-only and not even called in useAppointments.addAppointment. Crafted RPC can book Sat/Sun/holidays.
- The 28-day token-age check from the 2026-05-17 version was dropped in the makeup rewrite (now only expires_at>NOW()).
- `p_skip_token` (3h deadline -> no token) is decided client-side and trusted by the RPC — customer can lie. See [[booking-model-token-only]].

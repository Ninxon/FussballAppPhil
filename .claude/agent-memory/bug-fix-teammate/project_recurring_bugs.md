---
name: project-recurring-bugs
description: Recurring bug patterns discovered in the FussballApp across sessions
metadata:
  type: project
---

## todayStr() UTC bug (fixed 2026-05-20)
`new Date().toISOString().split('T')[0]` returns UTC date. In Germany (UTC+1/+2), this was "yesterday" for up to 2 hours per day. Fixed in `src/constants/i18n.ts` to use local time getFullYear/getMonth/getDate.

**Watch for:** Any other places that compute "today" as an ISO string — grep for `toISOString().split`.

## Realtime + optimistic update double-counting (fixed 2026-05-20)
`useAppointments.addAppointment` did optimistic slot count increment AND the Realtime INSERT handler also incremented. Fixed with `optimisticallyHandledRef` — register the appointment ID before optimistic update, skip in Realtime handler if present.

**Pattern:** Whenever both optimistic updates and Realtime subscriptions update the same derived state (counts, lists), one of them must be suppressed.

## Token expiry uses issued_at+28d instead of expires_at (fixed 2026-05-20)
`addAppointment` and `BuchenScreen` DateStep computed expiry as `issued_at + 28 days` but the DB stores `expires_at = issued_at + 1 month`. Days 29-31 were incorrectly rejected. Fixed to use `activeToken.expires_at` directly.

**Watch for:** Any client-side date arithmetic that duplicates server-set expiry logic.

## send-reminders missing program field (fixed 2026-05-20)
The Supabase query selected `user_id, date, time` but not `program`. Reminder emails showed no training type and had a generic subject. Fixed to select `program` and include it in subject and body.

## Email dates shown as ISO (fixed 2026-05-20)
All three email edge functions showed dates as `2026-05-20` instead of `20.05.2026`. Fixed with `split('-')` reversal in send-booking-email, send-cancellation-email, send-reminders.

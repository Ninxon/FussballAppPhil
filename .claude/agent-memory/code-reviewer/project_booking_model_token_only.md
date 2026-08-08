---
name: project-booking-model-token-only
description: Customer booking flow is token-only (Nachholtermin) — useAppointments.addAppointment requires an active cancellation token; quota/permission checks happen but normal "use up my monthly quota" booking is no longer an in-app flow
metadata:
  type: project
---

The customer-facing booking flow in `src/hooks/useAppointments.ts::addAppointment` only accepts bookings backed by an active `cancellation_token` (matching category). The 28-day deadline from `issued_at` is enforced client-side. Regular quota-based bookings (where a customer would consume `quota_individual` / `quota_gruppe`) are NOT exposed as an in-app flow for customers — the BuchenScreen labels the entire flow "Nachholtermin buchen" and shows only token-backed slots.

**Why:** Aligns with [[project-pkxapp-state]] (2026-05-16 implementation snapshot). The admin schedules base appointments via `addAppointmentForCustomer` (which bypasses all checks); customers can only rebook into a token after a cancellation.

**How to apply:** When reviewing client booking logic, do not flag "missing checkMonthlyQuota call" as a bug in `addAppointment`. The function `checkMonthlyQuota` exists but is only kept for tests and admin-side reasoning. If the user later re-introduces quota-based customer booking, the call must be added explicitly and the "token required" guard removed.

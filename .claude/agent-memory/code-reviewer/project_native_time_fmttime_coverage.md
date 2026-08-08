---
name: native-time-fmttime-coverage
description: After date/time text→native migration, every code path reading appointments.time / trainer_schedules.time from PostgREST must normalize "HH:MM:SS"→"HH:MM"
metadata:
  type: project
---

The `feature/native-date-types` branch migrated `appointments.time`, `trainer_schedules.time` (and `appointments.date`, `profiles.birth_date`) from text to native PG types. PostgREST serializes `time` as `"HH:MM:SS"`, but the whole frontend assumes `"HH:MM"`.

**Why:** A `fmtTime` normalizer (`a.time.slice(0,5)`) was added in `useAppointments.ts` and `useAdminData.ts`, but NOT in every path that reads `time` directly from the table via PostgREST.

**How to apply:** When reviewing any change that reads `time` from `appointments` or `trainer_schedules` over PostgREST (`.from(...).select(...)`), confirm the value is normalized before it is compared against `"HH:MM"` literals (e.g. the `SLOTS`/`TIMES` arrays) or rendered. RPCs `get_slot_counts`/`get_slot_players`/`book_with_token` already format server-side via `to_char(time,'HH24:MI')` — those are safe. Known-unfixed paths at branch review time: `src/trainer/TrainerApp.tsx` (renders `{appt.time}`) and `src/hooks/useTrainerSchedules.ts` (feeds customer `BuchenScreen` trainer-gating + admin `ZeitplanScreen` toggle state). A mismatch silently breaks slot filtering — no error, slots just disappear or show capacity 0.

Related: [[booking-model-token-only]]

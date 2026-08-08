---
name: project-slot-trainer-availability
description: How time slots are generated and filtered against trainer availability (trainer_schedules) in BuchenScreen + book_with_token
metadata:
  type: project
---

Time slots are a hybrid static/dynamic system, not purely static.

- Base grid is static: `src/constants/slots.ts` → `SLOTS = ['13:00'..'19:00']` (hourly).
- Trainer availability lives in `trainer_schedules` table (migration `20260512_trainer_schedules.sql`): `{trainer_id, day_of_week 1-5, time}`. Admin edits it in `src/admin/screens/ZeitplanScreen.tsx`. Loaded via `useTrainerSchedules` hook (also fetches trainer profiles with `trainer_specialty` spieler|torwart).
- `BuchenScreen.TimeStep` filters `SLOTS` down to `scheduledTimes` for the selected program's required specialty + day-of-week. Capacity per slot = baseCapacity * (number of trainers scheduled that slot).
- Server enforcement: `book_with_token` RPC assigns a trainer (`v_trainer_id`) and `check_slot_capacity()` trigger computes dynamic capacity the same way.

**Why:** Customers should only see times a matching trainer actually works. The filter and capacity already implement this.

**How to apply:** When reviewing slot/booking changes, the trainer-availability path is the source of truth — don't recommend "add a trainer availability table," it exists. Watch for these known gaps instead:
1. `book_with_token` does NOT reject when no trainer matches — `v_trainer_id` stays NULL and the INSERT still succeeds (trainer_id is nullable). The UI hides the slot but a crafted RPC call bypasses it. This is the load-bearing server-side hole.
2. `check_slot_capacity()` falls back to `trainer_count := 1` when zero trainers — so a no-trainer slot still allows 1 (or 4) bookings server-side, inconsistent with the UI hiding it.
3. UI capacity (baseCapacity * trainerCount) and server per-trainer assignment can disagree for multi-trainer group slots (UI treats it as one big pool of 4*N; server fills per-trainer buckets of 4).

Related: [[project_native_time_fmttime_coverage]] (time is native `time` type, serialized HH:MM:SS, normalized in hooks).

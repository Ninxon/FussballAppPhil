# Memory Index

- [Booking model is token-only](project_booking_model_token_only.md) — customer in-app booking requires an active cancellation_token; quota path is admin-side only
- [Native time fmtTime coverage](project_native_time_fmttime_coverage.md) — after text→native time migration, every PostgREST read of .time must slice HH:MM:SS→HH:MM
- [Slot generation + trainer availability](project_slot_trainer_availability.md) — slots are static SLOTS grid filtered by trainer_schedules; known UI/server gaps (NULL trainer accepted, capacity fallback)
- [Makeup cancel limit](project_makeup_cancel_limit.md) — is_makeup/makeup_count chain (commit 7831a9f); off-by-one allows 3 bookings, no server-side weekend/holiday guard

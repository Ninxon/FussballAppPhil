-- Nicht-buchbare Zeiträume (z.B. Schulferien) + hessische Feiertage (Fronleichnam).
--
-- Datenfluss: Edge Function `sync-school-holidays` zieht die hessischen Sommer-
-- und Weihnachtsferien von openholidaysapi.org und schreibt sie in
-- blocked_periods. pg_cron triggert das monatlich (Job 'sync-school-holidays-monthly',
-- '0 3 1 * *'). Client (BuchenScreen/TerminkalenderScreen via useBlockedPeriods)
-- UND Server (is_bookable_day) lesen dieselbe Tabelle.

create table if not exists public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date   date not null,
  reason     text not null default '',
  source     text not null default 'manual',  -- 'school_holiday_sync' | 'manual'
  created_at timestamptz not null default now(),
  constraint blocked_periods_date_order check (end_date >= start_date)
);

alter table public.blocked_periods enable row level security;

-- Lesen darf jeder (Client braucht die Sperrzeiträume für den Kalender).
drop policy if exists "blocked_periods_select_all" on public.blocked_periods;
create policy "blocked_periods_select_all" on public.blocked_periods
  for select using (true);

-- Schreiben nur Admin (der Sync läuft als service_role und umgeht RLS).
drop policy if exists "blocked_periods_admin_write" on public.blocked_periods;
create policy "blocked_periods_admin_write" on public.blocked_periods
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.blocked_periods to anon, authenticated;
grant all   on public.blocked_periods to service_role;

create index if not exists blocked_periods_range_idx
  on public.blocked_periods (start_date, end_date);

-- is_bookable_day: + Fronleichnam (Hessen) + blocked_periods-Check.
-- Wird STABLE statt IMMUTABLE, da jetzt eine Tabelle gelesen wird.
-- (Nur in book_with_token aufgerufen; keine Indizes/Generated Columns betroffen.)
create or replace function public.is_bookable_day(d date)
returns boolean
language plpgsql
stable
set search_path to ''
as $function$
declare
  y int  := extract(year from d)::int;
  e date := public.german_easter(extract(year from d)::int);
begin
  if extract(isodow from d) in (6, 7) then
    return false;
  end if;
  if d in (
    make_date(y, 1, 1),    -- Neujahr
    e - 2,                 -- Karfreitag
    e + 1,                 -- Ostermontag
    make_date(y, 5, 1),    -- Tag der Arbeit
    e + 39,                -- Christi Himmelfahrt
    e + 50,                -- Pfingstmontag
    e + 60,                -- Fronleichnam (Hessen)
    make_date(y, 10, 3),   -- Tag der Deutschen Einheit
    make_date(y, 12, 25),  -- 1. Weihnachtstag
    make_date(y, 12, 26)   -- 2. Weihnachtstag
  ) then
    return false;
  end if;
  if exists (
    select 1 from public.blocked_periods bp
    where d between bp.start_date and bp.end_date
  ) then
    return false;
  end if;
  return true;
end;
$function$;

-- Monatlicher Sync der Schulferien (Edge Function via pg_cron + pg_net).
-- Hinweis: in der Live-DB bereits angelegt; hier zur Nachvollziehbarkeit.
-- select cron.schedule(
--   'sync-school-holidays-monthly', '0 3 1 * *',
--   $$ SELECT net.http_post(
--        url := 'https://mgdrbgtsaqhgrdsnpasv.supabase.co/functions/v1/sync-school-holidays',
--        headers := jsonb_build_object(
--          'Content-Type','application/json',
--          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1)
--        ),
--        body := '{}'::jsonb
--      ); $$
-- );

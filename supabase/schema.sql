-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Free tier Postgres. Users sign in with Google through Supabase Auth; the Express server queries as the signed-in
-- user (anon key + their access token), so the row-level security policies below decide what each user can touch.

-- ====================================================================
-- QUICK FIX FOR EXISTING TABLES (Fixes missing 'team' column error):
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS team text default '';
-- ====================================================================

create table if not exists public.jobs (
  id text primary key,
  company text not null,
  job_title text not null,
  team text not null default '',
  location text not null default '',
  salary text not null default 'Not listed',
  status text not null default 'Applied' check (status in ('Saved', 'Applied', 'Interviewing', 'Offer', 'Accepted', 'Rejected', 'Declined')),
  date_applied date,
  industry text not null default '',
  -- glassdoor_rating kept for backward compatibility; app no longer reads/writes it
  glassdoor_rating text not null default '',
  summary text not null default '',
  url text not null default '',
  company_metadata jsonb not null default '{}'::jsonb,
  position_metadata jsonb not null default '{"requiredSkills":[]}'::jsonb,
  extracted_via text,
  created_at timestamptz not null default now(),
  notes text not null default '',
  status_history jsonb not null default '[]'::jsonb,
  -- Owner of the row. Defaults to the signed-in user so the server never needs to trust a client-sent value.
  user_id uuid default auth.uid() references auth.users (id) on delete cascade
);

-- Backward-compatible add for existing projects created before status_history
alter table public.jobs
  add column if not exists status_history jsonb not null default '[]'::jsonb,
  add column if not exists team text default '';

-- Migration block to update status check constraint for existing databases
alter table public.jobs drop constraint if exists status_check;
alter table public.jobs add constraint status_check check (status in ('Saved', 'Applied', 'Interviewing', 'Offer', 'Accepted', 'Rejected', 'Declined'));

-- Optional columns (app automatically stores these safely in position_metadata JSONB as well for zero-migration compatibility)
alter table public.jobs
  add column if not exists date_added date,
  add column if not exists salary_min integer,
  add column if not exists salary_max integer;

create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

-- Multi-user: every job belongs to one Supabase Auth user.
alter table public.jobs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.jobs alter column user_id set default auth.uid();
create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
-- After rows created before sign-in existed have been assigned an owner (see docs/MIGRATIONS.md, v0.6.0), run:
--   alter table public.jobs alter column user_id set not null;

alter table public.jobs enable row level security;

-- Each signed-in user can read and write only their own jobs. Signed-out (anon) requests match no policy.
drop policy if exists jobs_select_own on public.jobs;
drop policy if exists jobs_insert_own on public.jobs;
drop policy if exists jobs_update_own on public.jobs;
drop policy if exists jobs_delete_own on public.jobs;
create policy jobs_select_own on public.jobs for select to authenticated using (user_id = (select auth.uid()));
create policy jobs_insert_own on public.jobs for insert to authenticated with check (user_id = (select auth.uid()));
create policy jobs_update_own on public.jobs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy jobs_delete_own on public.jobs for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.jobs to authenticated;
revoke all on public.jobs from anon;

comment on table public.jobs is 'Job Application Easy Tracker records';

-- Daily allowances (jobs added by link or text, company lookups) counted per user per UTC day. Kept in the database
-- so the count survives restarts and is shared by every copy of the server. Users cannot touch the table directly;
-- the server counts through take_daily_usage(), which only ever counts for the caller (auth.uid()).
create table if not exists public.daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  day date not null,
  count integer not null default 0,
  primary key (user_id, kind, day)
);
alter table public.daily_usage enable row level security;
revoke all on public.daily_usage from anon, authenticated;

-- Counts one use of p_kind for the signed-in caller today; true while they are within p_limit, false once it is spent.
create or replace function public.take_daily_usage(p_kind text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if uid is null then
    return false;
  end if;
  insert into public.daily_usage as u (user_id, kind, day, count)
  values (uid, p_kind, today, 1)
  on conflict (user_id, kind, day) do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into used;
  -- Also clear the caller's rows from earlier days so the table stays small.
  delete from public.daily_usage where user_id = uid and day < today;
  return used is not null;
end;
$$;
revoke all on function public.take_daily_usage(text, integer) from public, anon;
grant execute on function public.take_daily_usage(text, integer) to authenticated;


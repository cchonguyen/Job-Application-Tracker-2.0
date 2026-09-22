-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Free tier Postgres. The app uses the service role key server-side only.

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
  status_history jsonb not null default '[]'::jsonb
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

alter table public.jobs enable row level security;

-- No anon/authenticated policies: only the service role (used by the Express server) can read/write.
-- Do not put the service role key in frontend code.

comment on table public.jobs is 'Job Application Easy Tracker records';

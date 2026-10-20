# Database migrations

How to bring an existing production Supabase database up to date with `supabase/schema.sql`. Newest first. A new database needs none of this: run `schema.sql` once (README › Supabase).

Run SQL in Supabase → **SQL Editor** → **New query**. Every block here is safe to run more than once.

---

## v0.7.0: daily limits counted in the database

The per-user daily limits (jobs added by link or pasted text, company lookups) are now counted in Supabase instead of in the server's memory, so they still apply when the app runs on Cloudflare, where many short-lived copies of the server share the work. Until this SQL is run the app keeps working and counts in memory as before.

1. **Add the counter table and function.**

   ```sql
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
   ```

---

## v0.6.0: Google sign-in and per-user jobs

Each job now belongs to one Supabase Auth user, and row-level security keeps accounts apart. Do steps 1–3 before deploying v0.6.0; the earlier version keeps working while they are applied.

1. **Add the owner column and policies.**

   ```sql
   alter table public.jobs
     add column if not exists user_id uuid references auth.users (id) on delete cascade;
   alter table public.jobs alter column user_id set default auth.uid();
   create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);

   alter table public.jobs enable row level security;
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
   ```

2. **Turn on Google sign-in** in Google Cloud and Supabase (README › Supabase, step 4).
3. **Set `SUPABASE_ANON_KEY`** (and optionally `GOOGLE_OAUTH_CLIENT_ID`) on Render, then deploy.
4. **Claim the jobs saved before sign-in existed.** Sign in once with the account that should own them, then run:

   ```sql
   update public.jobs
   set user_id = (select id from auth.users where email = 'YOUR_EMAIL@gmail.com')
   where user_id is null;

   alter table public.jobs alter column user_id set not null;
   ```

   Until the update runs, those jobs are invisible to everyone. If it reports 0 rows, check the email under **Authentication → Users**.
5. **Remove retired secrets** from Render: `API_ACCESS_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Nothing reads them, and the service-role key bypasses every policy.

---

## Before v0.6.0: added columns

Databases created from an early `schema.sql` may lack later columns. This brings them level and is a no-op on a current table:

```sql
alter table public.jobs
  add column if not exists status_history jsonb not null default '[]'::jsonb,
  add column if not exists team text default '',
  add column if not exists date_added date,
  add column if not exists salary_min integer,
  add column if not exists salary_max integer;

alter table public.jobs drop constraint if exists status_check;
alter table public.jobs add constraint status_check
  check (status in ('Saved', 'Applied', 'Interviewing', 'Offer', 'Accepted', 'Rejected', 'Declined'));
```

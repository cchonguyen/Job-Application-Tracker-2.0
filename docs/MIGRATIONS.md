# Database migrations

How to bring an existing production Supabase database up to date with `supabase/schema.sql`. Newest first. A new database needs none of this: run `schema.sql` once (README › Supabase).

Run SQL in Supabase → **SQL Editor** → **New query**. Every block here is safe to run more than once.

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

-- Yarhi Pro — Supabase schema (הרץ ב-SQL Editor בקונסולת Supabase)
-- מקביל ל-Firebase; לא מוחק ולא מחליף אותו.

-- פרופיל קבלן (מקביל ל-users/{uid} ב-Firestore)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  business_name text default '',
  contractor_name text default '',
  phone text default '',
  registration_plan text default '',
  payment_method text default '',
  payment_proof_file_name text,
  terms_accepted_at timestamptz,
  terms_version text,
  account_approved boolean not null default false,
  -- דחייה ידנית ממסך האישור — לא מופיע בממתינים, בלי לאשר גישה
  account_rejected boolean not null default false,
  access_valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Workspace אישי (מקביל ל-yarhiWorkspace)
create table if not exists public.workspaces (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;

-- קריאה: רק המשתמש עצמו
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- יצירה: רק המשתמש עצמו, ורק עם account_approved = false
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and account_approved = false
  );

-- עדכון: המשתמש לא יכול לאשר את עצמו / לשנות תוקף
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and account_approved = (select p.account_approved from public.profiles p where p.id = auth.uid())
    and access_valid_until is not distinct from (select p.access_valid_until from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
  on public.workspaces for select
  using (auth.uid() = user_id);

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own"
  on public.workspaces for insert
  with check (auth.uid() = user_id);

create table if not exists public.share_sims (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.share_sims enable row level security;

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own"
  on public.workspaces for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

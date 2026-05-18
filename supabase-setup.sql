-- ============================================================
-- Real Estate Hub — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Main key-value storage table (stores everything: leads, tasks, settings…)
create table if not exists public.user_data (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null default 'null'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

-- Index for fast key lookups per user
create index if not exists user_data_user_key on public.user_data (user_id, key);

-- Row Level Security — each user can only see/edit their own data
alter table public.user_data enable row level security;

drop policy if exists "Users can manage their own data" on public.user_data;
create policy "Users can manage their own data"
  on public.user_data
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_updated_at on public.user_data;
create trigger user_data_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();

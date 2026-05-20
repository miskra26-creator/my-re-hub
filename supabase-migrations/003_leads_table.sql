-- ============================================================
-- Migration 003 — Dedicated `leads` table
--
-- Previously leads were stored as one giant JSON blob in user_data.value
-- with key='leads'. At 6000+ rows this is ~2MB per read/write and was
-- causing freeze-on-typing. This migration creates a proper row-per-lead
-- table with indexes for fast queries, RLS for per-user isolation, and
-- realtime subscriptions for cross-device sync.
--
-- The application layer (cloudHooks → useLeadsCloud) handles the
-- one-time migration from the old user_data.value blob → this new table.
-- ============================================================

create table if not exists public.leads (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default '',
  email        text default '',
  phone        text default '',
  type         text default 'Buyer',
  status       text default 'warm',
  budget       text default '',
  area         text default '',
  notes        text default '',
  source       text default '',
  address      text default '',
  fub_id       text,
  tags         jsonb default '[]'::jsonb,
  follow_up    date,
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indexes for the queries we actually run
create index if not exists leads_user_id          on public.leads (user_id);
create index if not exists leads_user_id_status   on public.leads (user_id, status);
create index if not exists leads_user_id_updated  on public.leads (user_id, updated_at desc);
create index if not exists leads_user_id_fubid    on public.leads (user_id, fub_id) where fub_id is not null;

-- RLS: each user only sees their own leads
alter table public.leads enable row level security;

drop policy if exists "Users manage their own leads" on public.leads;
create policy "Users manage their own leads"
  on public.leads
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Base table grants — required IN ADDITION to RLS
grant select, insert, update, delete on public.leads to authenticated;

-- Auto-bump updated_at on every UPDATE
create or replace function public.leads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.leads_set_updated_at();

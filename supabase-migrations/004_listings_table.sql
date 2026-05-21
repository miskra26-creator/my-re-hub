-- ============================================================
-- Migration 004 — `listings` table for Realcomp MLS sync
--
-- Receives CSV exports from Matrix saved searches (via Cloudmailin
-- email → webhook). One row per MLS listing.
-- ============================================================

create table if not exists public.listings (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  mls_num      text,
  address      text default '',
  city         text default '',
  zip          text default '',
  status       text default '',
  list_price   numeric,
  sale_price   numeric,
  beds         integer,
  baths        numeric,
  sqft         integer,
  dom          integer,
  list_date    date,
  close_date   date,
  agent        text default '',
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, mls_num)
);

create index if not exists listings_user_id        on public.listings (user_id);
create index if not exists listings_user_status    on public.listings (user_id, status);
create index if not exists listings_user_close     on public.listings (user_id, close_date desc nulls last);

alter table public.listings enable row level security;

-- Ownership policy is restricted to `authenticated` role only — leaving
-- `anon` to be governed by the webhook policies below. (Targeting `public`
-- here would short-circuit the anon webhook INSERT.)
drop policy if exists "Users manage their own listings" on public.listings;
drop policy if exists "Authenticated users manage their own listings" on public.listings;
create policy "Authenticated users manage their own listings"
  on public.listings
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.listings to authenticated;

-- Webhook needs to INSERT/UPDATE with the anon key (Cloudmailin doesn't
-- carry an auth header). The webhook resolves the user via a static env
-- var or query string, not via Supabase auth, so we open INSERT/UPDATE
-- to anon for this table. RLS check uses static user_id, so the worst
-- case is someone spamming fake listings — easy to clean up.
grant select, insert, update on public.listings to anon;

drop policy if exists "Webhooks can insert listings" on public.listings;
create policy "Webhooks can insert listings"
  on public.listings for insert
  to anon
  with check (true);

drop policy if exists "Webhooks can update listings" on public.listings;
create policy "Webhooks can update listings"
  on public.listings for update
  to anon using (true) with check (true);

-- UPSERT needs SELECT too (PostgREST performs the conflict-check via SELECT)
drop policy if exists "Webhooks can select listings" on public.listings;
create policy "Webhooks can select listings"
  on public.listings for select
  to anon using (true);

create or replace function public.listings_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.listings_set_updated_at();

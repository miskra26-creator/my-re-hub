-- ============================================================
-- Migration 002 — Lead Inbox table
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- This table is where incoming lead webhook payloads land.
-- The React app reads from here, lets Monica import → goes into her
-- main leads array; or dismiss → just deletes the row.
-- ============================================================

create table if not exists public.lead_inbox (
  id           uuid default gen_random_uuid() primary key,
  source       text not null,
  name         text default '',
  email        text default '',
  phone        text default '',
  notes        text default '',
  area         text default '',
  budget       text default '',
  address      text default '',
  status       text default 'Hot Prospect',
  type         text default 'Buyer',
  raw          jsonb default '{}'::jsonb,
  received_at  timestamptz not null default now()
);

create index if not exists lead_inbox_received_at on public.lead_inbox (received_at desc);

alter table public.lead_inbox enable row level security;

-- Webhooks (anon key, server-side) can insert. We do server-side
-- validation in the webhook function before this point.
drop policy if exists "Webhooks can insert leads" on public.lead_inbox;
create policy "Webhooks can insert leads"
  on public.lead_inbox for insert
  to anon, authenticated
  with check (true);

-- Only signed-in users (Monica) can read what's in the inbox.
drop policy if exists "Authenticated users read inbox" on public.lead_inbox;
create policy "Authenticated users read inbox"
  on public.lead_inbox for select
  to authenticated using (true);

-- Only signed-in users can delete (after importing or dismissing).
drop policy if exists "Authenticated users delete inbox" on public.lead_inbox;
create policy "Authenticated users delete inbox"
  on public.lead_inbox for delete
  to authenticated using (true);

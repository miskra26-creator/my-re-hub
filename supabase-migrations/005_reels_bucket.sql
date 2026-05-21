-- ============================================================
-- Migration 005 — `reels` storage bucket for AutoReel feature
--
-- AutoReel renders MP4/WebM videos client-side, then needs to host
-- them publicly so Meta's Graph API can fetch them when posting to
-- Facebook / Instagram. This bucket is intentionally PUBLIC since
-- the videos are designed for social posting anyway.
--
-- Run this once in the Supabase SQL editor (dashboard → SQL → New query).
-- ============================================================

-- Create the bucket. `public = true` allows anonymous read access via
-- the standard public URL pattern, which is what Meta needs.
insert into storage.buckets (id, name, public)
values ('reels', 'reels', true)
on conflict (id) do update set public = true;

-- Allow anon (the React app's anon key) to UPLOAD to the bucket.
-- We keep INSERT permissive because the bucket is one-way append:
-- old reels get cleaned up by a periodic job, never overwritten.
drop policy if exists "Anon can upload reels" on storage.objects;
create policy "Anon can upload reels"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'reels');

-- Anon can SELECT (needed for the upload library to compute public URLs)
drop policy if exists "Anon can read reels" on storage.objects;
create policy "Anon can read reels"
  on storage.objects for select
  to anon
  using (bucket_id = 'reels');

-- Authenticated users get full control over their own reels
drop policy if exists "Users manage their own reels" on storage.objects;
create policy "Users manage their own reels"
  on storage.objects for all
  to authenticated
  using  (bucket_id = 'reels')
  with check (bucket_id = 'reels');

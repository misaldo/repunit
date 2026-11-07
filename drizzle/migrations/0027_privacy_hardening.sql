-- REPUNIT 0027: keep lift videos private and remove sensitive profile columns
-- from the anonymous PostgREST role while preserving public TOP/profile pages.

begin;

-- The lift-videos bucket must remain private. Anonymous users can no longer
-- read storage.objects for this bucket or mint signed playback URLs.
drop policy if exists "Public lift evidence readable by visitors" on storage.objects;

-- Reassert the signed-in policy used by createSignedUrl. Existing upload and
-- owner-delete policies are intentionally left unchanged.
drop policy if exists "lift videos signed-in read" on storage.objects;
create policy "lift videos signed-in read"
on storage.objects for select to authenticated
using (bucket_id = 'lift-videos');

update storage.buckets
set public = false
where id = 'lift-videos';

-- Remove any table-level grant inherited by anon/PUBLIC, then grant only the
-- columns needed by public profile pages. Authenticated keeps its existing
-- table-level SELECT grant and can still read its own full profile.
revoke select on table public.profiles from public, anon;
grant select (id, username, display_name, avatar_url, bio, created_at, profile_theme)
on table public.profiles to anon;

notify pgrst, 'reload schema';
commit;

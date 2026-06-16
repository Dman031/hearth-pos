-- ============================================================================
-- 0002_card_media_storage.sql — Storage bucket + RLS for card media (Day 12.5)
-- ============================================================================
-- Creates the `card-media` Storage bucket the POS card editor uploads photos to.
-- The resulting public URL is stored in a card's existing `fields.media_url`
-- entry (utils/card-fields.ts) — this migration does NOT touch `cards` /
-- `entities` (frozen, network-read). It only adds a bucket and policies on the
-- managed `storage.objects` table.
--
-- OWNERSHIP MODEL (the load-bearing part): objects are keyed by entity id as the
-- FIRST path segment — `{entity_id}/{file}`. A signed-in vendor may only
-- write/replace/delete objects under a folder named after an entity THEY own
-- (entities.user_id = auth.uid()). Read is PUBLIC: content media is meant to be
-- seen, and the path is unguessable. See DEFERRED.md — if private-card media is
-- ever required, move to a private bucket + signed URLs (touches the render
-- side).
--
-- Apply once (Derrick): `supabase db push`, or paste into the SQL editor.
-- Idempotent guards (on conflict / duplicate_object) so a re-run is safe.
-- ============================================================================

begin;

-- ── bucket ──────────────────────────────────────────────────────────────────
-- public = true → getPublicUrl() serves objects without a signed token. 10 MB
-- file cap mirrors the client-side MAX_MEDIA_BYTES; allowed_mime_types pins it
-- to images (defense in depth behind the client validation).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-media',
  'card-media',
  true,
  10485760, -- 10 * 1024 * 1024
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── RLS on storage.objects ──────────────────────────────────────────────────
-- storage.objects already has RLS enabled by Supabase. We add four scoped
-- policies. The owner predicate reads `entities` (a DIFFERENT table), so there
-- is no RLS self-recursion — same shape as 0001's credential-request policies.
-- (storage.foldername(name))[1] = the first path segment = the entity id.

-- READ: public. Anyone may read objects in this bucket (content media).
do $$ begin
  create policy card_media_public_read
    on storage.objects
    for select to public
    using (bucket_id = 'card-media');
exception when duplicate_object then null; end $$;

-- WRITE: a signed-in vendor may upload only under a folder named after an
-- entity they own.
do $$ begin
  create policy card_media_insert_own
    on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'card-media'
      and (storage.foldername(name))[1] in (
        select id::text from public.entities where user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- REPLACE: same ownership predicate (upsert / overwrite own media).
do $$ begin
  create policy card_media_update_own
    on storage.objects
    for update to authenticated
    using (
      bucket_id = 'card-media'
      and (storage.foldername(name))[1] in (
        select id::text from public.entities where user_id = auth.uid()
      )
    )
    with check (
      bucket_id = 'card-media'
      and (storage.foldername(name))[1] in (
        select id::text from public.entities where user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- DELETE: same ownership predicate (remove own media).
do $$ begin
  create policy card_media_delete_own
    on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'card-media'
      and (storage.foldername(name))[1] in (
        select id::text from public.entities where user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

commit;

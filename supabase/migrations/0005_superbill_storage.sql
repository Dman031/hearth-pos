-- ============================================================================
-- 0005_superbill_storage.sql — PlexMed S8 · the private superbill bucket
-- ============================================================================
-- Paste WHOLE, once. One transaction. Ledger id 'pos-0005' (POS SEQUENCE RULE —
-- bare numeric ids belong to hearth-network's sequence and must never be reused).
-- No enum value anywhere in this file, so NO SPLIT-ENUM PAIR. Stated, not
-- skipped.
--
-- DEPENDS ON: hearth-network 0000 (entities), 0004 (current_entity_id — the
-- SECURITY DEFINER identity helper the policy below leans on), 0017
-- (engagements), 0041 (superbills; storage_path points in here), 0042
-- (issue_superbill — the only writer that records a path). Shape copied from
-- pos-0002 (card-media), whose ownership model this deliberately INVERTS.
-- Rulings: DEUS_DAY_BY_DAY.md S8-1, S8-2, S8-5, S8-6.
--
-- WHY A MIGRATION AND NOT A DASHBOARD CLICK (ruling S8-6, Derrick verbatim):
-- "a dashboard-created bucket is infrastructure with no file describing it."
--
-- THIS IS card-media'S OPPOSITE, ON PURPOSE. pos-0002 made a PUBLIC bucket with
-- an unguessable path, because content media is meant to be seen
-- (0002_card_media_storage.sql:12-16, which already flagged that private media
-- would need this shape). A superbill carries diagnosis codes and a patient's
-- name and date of birth. So:
--   * public = false — no getPublicUrl; every read is a short-lived signed URL;
--   * READ is scoped to the two people in the visit, not to the world;
--   * there is NO insert/update/delete policy for `authenticated` at all. The
--     edge function writes under service-role and is the only writer, which is
--     what keeps issue-once (S8-3) meaningful: a client that could overwrite the
--     object could change a receipt after it was handed over.
--
-- PATH: {engagement_id}/superbill.pdf (superbill/index.ts:361 — CORRECTED IN
-- PLACE 2026-08-30: this line read {engagement_id}/{superbill_id}.pdf, which the
-- function has never written. Benign, because the policy scopes on the FIRST
-- segment only and the id was never part of the predicate — but a wrong name in
-- a comment is how PROSE BECOMES AN ASSUMED IDENTIFIER, and the SPEC-CONTRACT
-- rule's own evidence is an agent doing exactly that with a table name from a
-- paragraph it had written itself.) The FIRST segment is the engagement,
-- which is what the policy scopes on — the same first-segment-is-the-owner idea
-- as pos-0002, with the engagement standing in for the entity because a
-- superbill has two rightful readers, not one.
--
-- RE-RUN SAFETY: on-conflict bucket upsert, duplicate_object-swallowing policy
-- guards, on-conflict receipt. Nothing destructive; no policy is dropped.
-- ============================================================================

begin;

-- ── bucket ──────────────────────────────────────────────────────────────────
-- 5 MB is generous for a one-page PDF and is the cap the renderer is built to;
-- allowed_mime_types pins the bucket to PDFs so a mislabelled upload fails at
-- the storage layer rather than becoming a file someone opens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'superbills',
  'superbills',
  false,
  5242880, -- 5 * 1024 * 1024
  array['application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── RLS on storage.objects ──────────────────────────────────────────────────
-- storage.objects already has RLS enabled by Supabase. ONE policy is added.
--
-- The predicate reads public.engagements — a DIFFERENT table from the one being
-- guarded — so there is no RLS self-recursion, the same shape pos-0002 used
-- against public.entities. Identity comes from public.current_entity_id()
-- (SECURITY DEFINER over entities, 0004:53), never from a sub-select of the
-- guarded table.
--
-- ::text ON THE ENTITY IDS, NOT ::uuid ON THE PATH SEGMENT. Casting the path to
-- uuid would THROW on any object whose first segment is not a uuid — one stray
-- file and every read in the bucket errors instead of simply not matching. The
-- comparison is text-to-text and a non-uuid folder just fails to match, which is
-- the correct failure.
--
-- BELT AND BRACES: engagements carries its own participant SELECT policy
-- (0017:92-96), so this sub-select is narrowed a second time by that policy.
-- Even if the predicate below were wrong, a caller could only ever name their
-- own engagements.
do $$ begin
  create policy superbills_read_participant
    on storage.objects
    for select to authenticated
    using (
      bucket_id = 'superbills'
      and (storage.foldername(name))[1] in (
        select e.id::text
          from public.engagements e
         where e.buyer_entity_id  = public.current_entity_id()
            or e.seller_entity_id = public.current_entity_id()
      )
    );
exception when duplicate_object then null; end $$;

-- DELIBERATELY NO insert / update / delete POLICY for `authenticated`.
-- Default-deny is the correct posture: the superbill edge function writes under
-- service-role (which bypasses RLS), and a receipt that its own recipient can
-- overwrite is not a receipt. If a correction flow is ever built (DEFERRED,
-- triggered by the first real request), it writes through the same service-role
-- path — never by granting the client a pen.

-- ── receipt (RECEIPT RULE: the FINAL statement of the file) ─────────────────
insert into public.schema_migrations (id) values ('pos-0005') on conflict (id) do nothing;

commit;

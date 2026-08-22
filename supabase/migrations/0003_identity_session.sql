-- ============================================================================
-- 0003_identity_session.sql — Identity amendment (R2): persist the Stripe ids
-- ============================================================================
-- Persists the Stripe Identity VerificationSession id (and report id) that
-- produced entities.id_verified, so the verified legal name can be fetched
-- SERVER-SIDE on demand at concordance time (R3 / R3-AMENDED), compared in
-- memory, and discarded. We store NO name, NO DOB, NO document data — only
-- Stripe ids. Rulings: DEUS_DAY_BY_DAY.md "RULINGS — 2026-08-20 (credential
-- verification, pre-build)" R2-R3 and "RULINGS — 2026-08-21 (identity-flow
-- amendment)".
--
-- Separate table, NOT a column on entities: entities is frozen + network-read
-- (src/types/entity.ts), and the app reads its own row with select *
-- (EntityContext), so any column there is client-readable — hearth-network
-- 0010 records why column REVOKE on entities is not an option. Pattern =
-- entity_stripe_accounts (0001): entity-keyed, RLS on, NO policies →
-- service-role only. The client never touches it. The only writer is the
-- stripe-identity-webhook edge function (service role); the only reader is
-- the server-side credential ceremony (service role).
--
-- One row per entity, upsert on re-verify. History lives at Stripe; R4 rules
-- out override paths, so there is no local need for prior sessions.
--
-- LEDGER (R-LEDGER, 2026-08-21): hearth-pos migrations receipt as 'pos-NNNN'
-- in the shared schema_migrations ledger — bare numeric ids are
-- hearth-network's sequence (seeded by its 0031). Catch-up rows for the
-- pre-ledger pos files 0001/0002 ride here once, on conflict do nothing.
--
-- No function is created (FUNCTION GRANT BLOCK n/a). TABLE RLS rule: enabled
-- below, before commit, default-deny. Apply once, by hand (Derrick), in the
-- Supabase SQL editor — the receipt lands with the table or not at all.
-- ============================================================================
begin;

create table if not exists public.entity_identity_sessions (
  entity_id         uuid primary key references public.entities(id) on delete cascade,
  stripe_session_id text not null unique
                      check (stripe_session_id like 'vs\_%'),
  stripe_report_id  text unique
                      check (stripe_report_id is null or stripe_report_id like 'vr\_%'),
  livemode          boolean not null,                    -- test vs live session
  verified_at       timestamptz not null default now(),  -- when the verified event landed
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.entity_identity_sessions is
  'Stripe Identity session/report ids behind entities.id_verified. Service-role only. '
  'Never store name/DOB here (R2). Read on demand at concordance time (R3).';

-- RLS on, no policies: default-deny for anon/authenticated (MIGRATION TABLE RLS rule).
alter table public.entity_identity_sessions enable row level security;
-- Belt-and-braces on top of RLS: strip the default-ACL table grants too
-- (pg_default_acl grants anon/authenticated ALL on every new table).
revoke all on table public.entity_identity_sessions from public, anon, authenticated;
-- service_role keeps its default grant and bypasses RLS — the only reader/writer.

-- RECEIPT RULE (final statements). Catch-up for the pre-ledger pos files first.
insert into public.schema_migrations (id) values ('pos-0001'), ('pos-0002')
  on conflict do nothing;
insert into public.schema_migrations (id) values ('pos-0003');

commit;

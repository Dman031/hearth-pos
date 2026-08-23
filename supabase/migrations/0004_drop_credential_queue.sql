-- ============================================================================
-- 0004_drop_credential_queue.sql — CRED S2 · retire the force-approve path
-- ============================================================================
-- Ruling F5 (DEUS_DAY_BY_DAY.md, "RULINGS — 2026-08-22 (credential S2
-- proposal, seven flags ruled)"): pos-0001's approve_credential_request()
-- sets entities.credential_verified = true from a request id alone — no
-- primary source, no concordance, no verifications row. While it exists,
-- CRED S4's proof standard assertion 3 ("no code path force-approves a
-- failed concordance") is FALSE. This drops the function and the queue it
-- drained. It MUST precede CRED S4.
--
-- AFTER THIS MIGRATION, entities.credential_verified has exactly ONE writer:
-- public.record_verification_outcome (hearth-network 0035), which derives it
-- from a live verified license row:
--   credential_verified = exists (select 1 from public.verifications v
--     where v.entity_id = e.id and v.type = 'license'
--       and v.status = 'verified' and v.voided_at is null)
-- There is no override path (R4): no function in 0035 can move
-- manual_review -> verified; that is CRED S3's archived phone-binding
-- ceremony (method = manual_fallback), never an approve button.
--
-- QUEUE CONTENTS: zero rows at proposal time (service-role census,
-- 2026-08-22). The assertion below re-checks IN-TRANSACTION so a row
-- inserted between proposal and apply aborts the migration rather than being
-- silently destroyed — credential_requests_insert_own (0001:61-68) grants
-- INSERT to authenticated and stays live until this commits. 0025's
-- in-transaction-assertion house style.
--
-- Dropping the table takes its policies (credential_requests_insert_own,
-- credential_requests_select_own) and both indexes
-- (credential_requests_entity_idx, credential_requests_status_idx) with it.
-- No CASCADE is needed: nothing references the table.
--
-- APP IMPACT: none at apply time. src/services/credentials.ts's
-- submitCredentialRequest() is the only code touching the queue and it has
-- ZERO callers (no screen imports it, no edge function references it). The
-- app repoint to request_credential_verification(p_type, p_number, p_board)
-- lands in a separate commit AFTER this is hand-applied.
--
-- MIGRATION FUNCTION GRANT BLOCK: n/a — no function is created.
-- MIGRATION TABLE RLS: n/a — no table is created.
-- NOT TOUCHED: public.entity_stripe_accounts (pos-0001) — live, read and
-- written by the create-connect-account edge function; and
-- public.entity_identity_sessions (pos-0003) — the R-GAP gate that
-- request_credential_verification depends on.
--
-- RE-RUN SAFETY: IF EXISTS on both drops; the assertion passes trivially on
-- a re-run (to_regclass is null once the table is gone); the receipt is
-- on-conflict-do-nothing.
--
-- LEDGER (POS SEQUENCE RULE): hearth-pos migrations receipt as 'pos-NNNN' in
-- the shared schema_migrations ledger — bare numeric ids are hearth-network's
-- sequence. Applying this file in the SQL editor IS recording it.
--
-- Apply once, by hand (Derrick), in the Supabase SQL editor.
-- ============================================================================

begin;

-- Guard: never destroy a request that arrived after the census.
do $$
declare
  v_n bigint;
begin
  if to_regclass('public.credential_verification_requests') is not null then
    execute 'select count(*) from public.credential_verification_requests' into v_n;
    if v_n > 0 then
      raise exception
        'credential_verification_requests holds % row(s) — resolve before dropping (F5)', v_n
        using errcode = 'P0001';
    end if;
  end if;
end $$;

-- 1. The force-approve function (pos-0001:84-111). Dropped FIRST: it is the
--    assertion-3 violation; the table is only its input.
drop function if exists public.approve_credential_request(uuid);

-- 2. The queue (pos-0001:33-47), with its two policies and two indexes.
drop table if exists public.credential_verification_requests;

-- --- RECEIPT (final statement — RECEIPT RULE / POS SEQUENCE RULE) -----------
insert into public.schema_migrations (id) values ('pos-0004') on conflict do nothing;

commit;

-- ── VERIFY (after apply, Derrick) ───────────────────────────────────────────
--   select id, applied_at from public.schema_migrations where id = 'pos-0004';
--   select proname from pg_proc where proname = 'approve_credential_request';
--     -- expect: 0 rows
--   select to_regclass('public.credential_verification_requests');
--     -- expect: null
--   select tablename, policyname from pg_policies
--    where tablename = 'credential_verification_requests';
--     -- expect: 0 rows
--   select to_regclass('public.entity_stripe_accounts'),
--          to_regclass('public.entity_identity_sessions');
--     -- expect: both non-null (untouched)

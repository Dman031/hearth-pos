-- ============================================================================
-- 0001_pos_verification.sql — POS-only tables for business + credential verify
-- ============================================================================
-- These tables are OWNED BY hearth-pos and are NOT read by the network. They do
-- NOT touch `entities` / `cards` (frozen, network-read) — they only carry the
-- side data POS needs to drive verification, and the verified VERDICT lands on
-- the pre-existing entities.business_verified / entities.credential_verified
-- columns via the service role (Connect webhook / approval function).
--
-- Apply once (Derrick): `supabase db push`, or paste into the SQL editor.
-- Idempotent guards (IF NOT EXISTS / enum-safe DO blocks) so a re-run is safe.
-- ============================================================================

begin;

-- ── entity_stripe_accounts ──────────────────────────────────────────────────
-- One Stripe Connect (Express) account per entity. Lets a repeat "verify
-- business" tap reuse the same account instead of creating duplicates, and lets
-- the webhook map account.metadata.entity_id back to a row. Entity-keyed so it
-- stays decoupled from the legacy vendor_profiles model.
create table if not exists public.entity_stripe_accounts (
  entity_id          uuid primary key references public.entities(id) on delete cascade,
  connect_account_id text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── credential_verification_requests ────────────────────────────────────────
-- The manual-verify QUEUE for regulated credentials (doctor license, etc.).
-- A vendor submits a license; an admin approves via approve_credential_request()
-- which flips entities.credential_verified. Deliberately minimal — no API, no
-- admin UI; the queue's only job is to hold a request until the flag is set.
create table if not exists public.credential_verification_requests (
  id            uuid primary key default extensions.uuid_generate_v4(),
  entity_id     uuid not null references public.entities(id) on delete cascade,
  license_type  text not null,
  license_number text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  note          text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists credential_requests_entity_idx
  on public.credential_verification_requests (entity_id);
create index if not exists credential_requests_status_idx
  on public.credential_verification_requests (status);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.entity_stripe_accounts          enable row level security;
alter table public.credential_verification_requests enable row level security;

-- entity_stripe_accounts: service-role only. No anon/authenticated policies, so
-- RLS denies all direct app access; the Connect edge functions use the service
-- role (which bypasses RLS) to read/write it. The client never touches it.

-- credential_verification_requests: a signed-in vendor may INSERT and SELECT
-- ONLY rows for their own entity. No UPDATE/DELETE for app users — approval is
-- service-role / admin only (via the function below). The policy reads
-- `entities` (a DIFFERENT table), so there is no RLS self-recursion.
do $$ begin
  create policy credential_requests_insert_own
    on public.credential_verification_requests
    for insert to authenticated
    with check (
      entity_id in (select id from public.entities where user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy credential_requests_select_own
    on public.credential_verification_requests
    for select to authenticated
    using (
      entity_id in (select id from public.entities where user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- ── approve_credential_request() ────────────────────────────────────────────
-- The whole "approval" mechanism: set a request approved and flip the entity's
-- credential_verified. SECURITY DEFINER so it runs as the owner regardless of
-- the (admin) caller's RLS. EXECUTE is granted to service_role only — revoked
-- from anon/authenticated so a vendor can never self-approve.
create or replace function public.approve_credential_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_entity_id uuid;
begin
  update public.credential_verification_requests
     set status = 'approved', reviewed_at = now()
   where id = p_request_id
     and status = 'pending'
  returning entity_id into v_entity_id;

  if v_entity_id is null then
    raise exception 'no pending credential request with id %', p_request_id;
  end if;

  update public.entities
     set credential_verified = true, updated_at = now()
   where id = v_entity_id;
end;
$$;

revoke all on function public.approve_credential_request(uuid) from public;
revoke all on function public.approve_credential_request(uuid) from anon, authenticated;
grant execute on function public.approve_credential_request(uuid) to service_role;

commit;

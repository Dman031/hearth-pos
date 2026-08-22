#!/usr/bin/env node
/**
 * rebind-identity-sessions.mjs — one-time ops: bind already-verified entities
 * to the Stripe Identity session that verified them (R-GAP, 2026-08-21).
 *
 * Entities flagged id_verified=true BEFORE pos-0003 have no row in
 * entity_identity_sessions and cannot bind at concordance time. Every session
 * our create-identity-session function ever created carries
 * metadata.entity_id, and Stripe retains sessions unredacted (R2-ADDENDUM), so
 * the binding can be rebuilt from Stripe WITHOUT redoing the ID check:
 *
 *   1. list Stripe VerificationSessions with status=verified (paginated) —
 *      NO expand parameter, ever: the list carries ids/metadata/livemode only,
 *      never verified_outputs / names / DOB (asserted below);
 *   2. newest verified session per metadata.entity_id;
 *   3. upsert entity_identity_sessions for each id_verified entity that has no
 *      row yet (already-bound rows are left alone and reported if they differ);
 *   4. GUARDED FINAL STEP (--reset-unbound): entities still unbound after (3)
 *      whose deus_id is in RESET_DEUS_IDS AND user_id is null (hand-set flags,
 *      no session ever existed) get id_verified=false — R7: stamps mean a check
 *      happened. Any other unbound entity is REPORTED, never touched.
 *
 * Default is a DRY RUN (plan only). --apply performs (3); --reset-unbound adds
 * (4) and requires --apply. Run once per Stripe mode (test key → dev entities,
 * live key → prod entities); livemode is recorded on the row.
 *
 * Env (never printed): STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Usage: node scripts/rebind-identity-sessions.mjs [--apply] [--reset-unbound]
 */
import { createClient } from '@supabase/supabase-js';

const RESET_DEUS_IDS = new Set(['184203', '100001']); // R-GAP: Blue Hour, Derrick Wilson
const STRIPE_API = 'https://api.stripe.com/v1/identity/verification_sessions';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const RESET_UNBOUND = args.has('--reset-unbound');
for (const a of args) {
  if (a !== '--apply' && a !== '--reset-unbound') fail(`unknown flag ${a}`);
}
if (RESET_UNBOUND && !APPLY) fail('--reset-unbound requires --apply');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) fail(`missing env ${name}`);
  return v;
}
function fail(msg) {
  console.error(`[rebind] ${msg}`);
  process.exit(1);
}

const STRIPE_SECRET_KEY = requireEnv('STRIPE_SECRET_KEY');
const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Lists ALL verified sessions. Ids + metadata only — no expand, by construction. */
async function listVerifiedSessions() {
  const out = [];
  let startingAfter = null;
  for (;;) {
    const url = new URL(STRIPE_API);
    url.searchParams.set('status', 'verified');
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);
    if (url.search.includes('expand')) fail('refusing to expand — PII guard');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) fail(`stripe list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    for (const s of page.data ?? []) {
      if (s.verified_outputs !== undefined && s.verified_outputs !== null) {
        // Never expected on an unexpanded list; abort rather than hold PII.
        fail('list returned verified_outputs — aborting, nothing written');
      }
      out.push({
        id: s.id,
        livemode: s.livemode === true,
        created: typeof s.created === 'number' ? s.created : 0,
        entityId: typeof s.metadata?.entity_id === 'string' ? s.metadata.entity_id : null,
        reportId: typeof s.last_verification_report === 'string' ? s.last_verification_report : null,
        redacted: s.redaction != null,
      });
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return out;
}

async function main() {
  console.log(`[rebind] mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${RESET_UNBOUND ? ' + reset-unbound' : ''}`);

  // Ground truth: who is flagged, who is already bound.
  const { data: verified, error: vErr } = await supabase
    .from('entities')
    .select('id, deus_id, user_id')
    .eq('id_verified', true);
  if (vErr) fail(`entities select failed: ${vErr.message}`);
  const { data: boundRows, error: bErr } = await supabase
    .from('entity_identity_sessions')
    .select('entity_id, stripe_session_id');
  if (bErr) fail(`entity_identity_sessions select failed: ${bErr.message}`);
  const bound = new Map(boundRows.map((r) => [r.entity_id, r.stripe_session_id]));
  console.log(`[rebind] id_verified entities: ${verified.length}; already bound: ${bound.size}`);

  // Newest verified, unredacted session per entity.
  const sessions = await listVerifiedSessions();
  const newest = new Map();
  for (const s of sessions) {
    if (!s.entityId || s.redacted) continue;
    const cur = newest.get(s.entityId);
    if (!cur || s.created > cur.created) newest.set(s.entityId, s);
  }
  console.log(`[rebind] stripe verified sessions: ${sessions.length}; distinct entity_ids: ${newest.size}`);

  const plan = { bind: [], alreadyBound: [], mismatch: [], unbound: [] };
  for (const e of verified) {
    const s = newest.get(e.id);
    if (bound.has(e.id)) {
      if (s && bound.get(e.id) !== s.id) plan.mismatch.push({ e, s });
      else plan.alreadyBound.push(e);
    } else if (s) {
      plan.bind.push({ e, s });
    } else {
      plan.unbound.push(e);
    }
  }

  for (const { e, s } of plan.bind) {
    console.log(`[rebind] BIND   deus_id=${e.deus_id} entity=${e.id} ← ${s.id} (${s.livemode ? 'live' : 'test'}, report=${s.reportId ?? 'none'})`);
  }
  for (const { e, s } of plan.mismatch) {
    console.log(`[rebind] DIFFER deus_id=${e.deus_id} bound=${bound.get(e.id)} newest=${s.id} — left alone, review`);
  }
  for (const e of plan.unbound) {
    const eligible = RESET_DEUS_IDS.has(e.deus_id ?? '') && e.user_id === null;
    console.log(`[rebind] UNBOUND deus_id=${e.deus_id} entity=${e.id} login=${e.user_id ? 'yes' : 'no'} → ${eligible ? 'RESET-ELIGIBLE (R7)' : 'needs a fresh ID check; NOT touched'}`);
  }

  let boundCount = 0;
  let resetCount = 0;
  if (APPLY) {
    for (const { e, s } of plan.bind) {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('entity_identity_sessions')
        .upsert(
          {
            entity_id: e.id,
            stripe_session_id: s.id,
            stripe_report_id: s.reportId,
            livemode: s.livemode,
            verified_at: new Date(s.created * 1000).toISOString(),
            updated_at: nowIso,
          },
          { onConflict: 'entity_id' },
        )
        .select('entity_id');
      if (error) fail(`upsert failed for ${e.id}: ${error.message}`);
      if (!data || data.length === 0) fail(`upsert affected no rows for ${e.id}`);
      boundCount += 1;
    }

    if (RESET_UNBOUND) {
      // Guarded: allowlisted deus_id AND no login AND still unbound right now.
      for (const e of plan.unbound) {
        if (!RESET_DEUS_IDS.has(e.deus_id ?? '') || e.user_id !== null) continue;
        const { data: still, error: sErr } = await supabase
          .from('entity_identity_sessions')
          .select('entity_id')
          .eq('entity_id', e.id);
        if (sErr) fail(`guard select failed for ${e.id}: ${sErr.message}`);
        if (still.length > 0) {
          console.log(`[rebind] SKIP reset deus_id=${e.deus_id}: bound since plan`);
          continue;
        }
        const { data, error } = await supabase
          .from('entities')
          .update({ id_verified: false, updated_at: new Date().toISOString() })
          .eq('id', e.id)
          .eq('id_verified', true)
          .is('user_id', null)
          .select('id');
        if (error) fail(`reset failed for ${e.id}: ${error.message}`);
        if (!data || data.length === 0) fail(`reset affected no rows for ${e.id}`);
        console.log(`[rebind] RESET  deus_id=${e.deus_id} id_verified=false (R7)`);
        resetCount += 1;
      }
    }
  }

  console.log('[rebind] summary', {
    mode: APPLY ? 'apply' : 'dry-run',
    planned_bind: plan.bind.length,
    already_bound: plan.alreadyBound.length,
    differ: plan.mismatch.length,
    unbound: plan.unbound.length,
    bound_now: boundCount,
    reset_now: resetCount,
  });
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

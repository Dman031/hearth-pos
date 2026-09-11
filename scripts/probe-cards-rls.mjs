#!/usr/bin/env node
/**
 * probe-cards-rls.mjs — CAN A BUYER READ THE SELLER'S CARD?
 *
 * THE QUESTION, AND WHY IT IS NOT ANSWERABLE BY READING ANYTHING.
 * `useMyEngagements.ENGAGEMENT_SELECT` embeds `card:card_id ( kind )` so the
 * cancellation confirm can name the right refund window — 24 hours on a
 * practice slot, 14 days otherwise (N-20). `public.cards` has RLS ENABLED
 * (hearth-network 0000:141) and NO select policy in ANY migration in EITHER
 * repo: the five that exist are on audit_log, inbound, messages, threads and
 * engagements. Yet CardContext reads `cards` in production and works, so a
 * policy exists that no migration in the tree creates — applied by hand, and
 * therefore unreadable from source. Table RLS is also outside the two
 * sanctioned catalog helpers (admin_proacl covers FUNCTIONS only).
 *
 * So the honest instrument is a live read as a real signed-in buyer. Inference
 * from the migration tree would be inference from a tree that is known to be
 * missing the relevant object.
 *
 * WHAT TURNS ON THE ANSWER. On a practice booking the BUYER IS THE PATIENT. If
 * the embed resolves for them, the confirm names 24 hours and is right. If it
 * does not, `cardKind` is null for every practice cancellation from this app
 * and the "unknown" arm — which names no window and points at the unconditional
 * seller-cancel alternative — IS THE LIVE PATH, not a fallback. That is a
 * finding to report, not a default to be quietly satisfied with.
 *
 * ── HOW IT IS MEASURED ──────────────────────────────────────────────────────
 * The read under test runs on a client built with THE APP'S OWN ANON KEY and a
 * REAL SESSION from signInWithPassword. It is never service_role: service_role
 * bypasses RLS entirely and would answer "yes" to every question here, which is
 * the shape of check this repo's VERIFICATION DISCIPLINE rule exists to refuse.
 *
 * FOUR READS, NOT ONE, because "the buyer cannot" and "nobody can" are
 * different findings and a single read cannot tell them apart:
 *   A  buyer   -> cards, direct, by id        (see_perm 'anyone' and 'verified')
 *   B  buyer   -> engagements + the EXACT embed string the app ships
 *   C  seller  -> cards, direct, by id        (the control)
 *   D  seller  -> engagements + the same embed (the control)
 * B is the one that decides the app's behaviour; A isolates whether any refusal
 * is about `cards` or about the join. C and D say whether a refusal is
 * buyer-specific or total — if C fails too, CardContext's own read is at stake
 * and that is a much larger finding than the one this probe went looking for.
 *
 * RAW OUTPUT, ALWAYS. Every read prints its data and its error verbatim. A
 * probe that summarises is a probe you have to trust.
 *
 * THE TEARDOWN IS AN ASSERTION, PROVED BY READING BACK. Rows are created in the
 * live dev database; every one is deleted and the deletion is verified, and a
 * teardown that cannot prove itself EXITS NON-ZERO. Nothing leaves this system:
 * no Stripe, no Medplum, no email — rows only.
 *
 * Env (never printed):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  <- ../hearth-network/.dev.vars
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY            <- ./.env.local   (the app's key)
 * Usage: node scripts/probe-cards-rls.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── env ─────────────────────────────────────────────────────────────────────
const readEnvFile = (path) => {
  const out = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`BLOCKED: cannot read ${path} — ${err.message}`);
    process.exit(2);
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
};

const netEnv = readEnvFile('../hearth-network/.dev.vars');
const posEnv = readEnvFile('.env.local');

const SUPABASE_URL = process.env.SUPABASE_URL ?? netEnv.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? netEnv.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? posEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// requireEnv, applied at start rather than lazily at first use (CLAUDE.md).
for (const [name, value] of [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY],
]) {
  if (!value) {
    console.error(`BLOCKED: ${name} is not set. Nothing was created.`);
    process.exit(2);
  }
}
// The app's URL and the admin URL must be the same project, or the probe is
// measuring one database with another's key and the answer means nothing.
if (posEnv.EXPO_PUBLIC_SUPABASE_URL && posEnv.EXPO_PUBLIC_SUPABASE_URL !== SUPABASE_URL) {
  console.error(
    `BLOCKED: .env.local points at ${posEnv.EXPO_PUBLIC_SUPABASE_URL} but the admin key is for ` +
      `${SUPABASE_URL}. These must be the same project.`,
  );
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rand = () => Math.random().toString(36).slice(2, 8);
const tag = rand();
const iso = (ms) => new Date(ms).toISOString();
const show = (label, { data, error }) => {
  console.log(`\n--- ${label}`);
  console.log(`    data:  ${JSON.stringify(data)}`);
  console.log(`    error: ${error ? JSON.stringify({ code: error.code, message: error.message }) : 'null'}`);
  return { data, error };
};

const created = { users: [], entities: [], verifications: [], cards: [], threads: [], inbound: [], engagements: [] };
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

// THE EXACT EMBED THE APP SHIPS. Retyping a near-copy here would let this probe
// pass while the app's own string failed, which is the whole failure class this
// repo's single-source rules exist to stop. Kept verbatim from
// src/hooks/useMyEngagements.ts ENGAGEMENT_SELECT's embed clause.
const APP_EMBED = 'id, card_id, card:card_id ( kind )';

let sellerEntity, buyerEntity, cardAnyone, cardVerified, engagementId;
let asBuyer, asSeller;

try {
  // ── 1. fixture ────────────────────────────────────────────────────────────
  console.log('=== 1  fixture (service_role) ===');

  const mkUser = async (label) => {
    const email = `cardsrls-${tag}-${label}@example.invalid`;
    const password = `pw-${rand()}-${rand()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser(${label}): ${error.message}`);
    created.users.push(data.user.id);
    return { userId: data.user.id, email, password };
  };

  const mkEntity = async (label, user, extra) => {
    const { data, error } = await admin
      .from('entities')
      .insert({
        user_id: user.userId,
        deus_id: `cardsrls-${tag}-${label}`.slice(0, 24),
        display_name: `probe-cards-rls ${label}`,
        entity_type: 'person',
        ...extra,
      })
      .select('id')
      .single();
    if (error) throw new Error(`entity insert(${label}): ${error.message}`);
    created.entities.push(data.id);
    return data.id;
  };

  const sellerUser = await mkUser('seller');
  const buyerUser = await mkUser('buyer');
  // The buyer is id_verified so that a `see_perm = 'verified'` card is readable
  // ON THE PERMISSION'S OWN TERMS. Without it, a refusal on that card would be
  // ambiguous between "RLS hides it" and "this person does not meet see_perm",
  // and the probe would have manufactured its own confound.
  sellerEntity = await mkEntity('seller', sellerUser, { business_verified: true });
  buyerEntity = await mkEntity('buyer', buyerUser, { id_verified: true });

  // A PRACTICE CARD REQUIRES A VERIFIED LICENCE — enforced by the
  // cards_practice_requires_licence() trigger, not by RLS, and it fired on the
  // first run of this probe: "a practice card requires a verified licence
  // (code: LICENCE_NOT_VERIFIED)". The stamp is fixture, not subject: this probe
  // asks about READ permission on a card that exists, so the card has to exist.
  const { data: ver, error: verErr } = await admin
    .from('verifications')
    .insert({
      entity_id: sellerEntity,
      type: 'license',
      source: 'state_board:OR:omb',
      registry_ref: `ZZ:omb:CARDSRLS${tag.toUpperCase()}`,
      status: 'verified',
      method: 'psv_api',
      checked_at: iso(Date.now()),
      expires_at: iso(Date.now() + 365 * 24 * 3600 * 1000),
      monitor: false,
      snapshot: { fixture: 'probe-cards-rls.mjs', tag },
    })
    .select('id')
    .single();
  if (verErr) throw new Error(`verification insert: ${verErr.message}`);
  created.verifications.push(ver.id);

  const mkCard = async (label, seePerm) => {
    const { data, error } = await admin
      .from('cards')
      .insert({
        entity_id: sellerEntity,
        title: `probe-cards-rls ${label} ${tag}`,
        kind: 'practice',
        fields: [{ label: 'description', value: 'probe-cards-rls fixture. Not a real practice.' }],
        see_perm: seePerm,
        act_perm: 'verified',
        price_cents: 9500,
        price_currency: 'usd',
        commerce_enabled: false,
      })
      .select('id')
      .single();
    if (error) throw new Error(`card insert(${label}): ${error.message}`);
    created.cards.push(data.id);
    return data.id;
  };
  cardAnyone = await mkCard('anyone', 'anyone');
  cardVerified = await mkCard('verified', 'verified');

  // The engagement the app would be cancelling: buyer = the patient.
  const [a, b] = [sellerEntity, buyerEntity].sort();
  const { data: th, error: thErr } = await admin
    .from('threads')
    .insert({ participant_a: a, participant_b: b, state: 'open', established_at: iso(Date.now()) })
    .select('id')
    .single();
  if (thErr) throw new Error(`thread insert: ${thErr.message}`);
  created.threads.push(th.id);

  const { data: inb, error: inbErr } = await admin
    .from('inbound')
    .insert({
      from_entity_id: buyerEntity,
      to_entity_id: sellerEntity,
      card_id: cardAnyone,
      thread_id: th.id,
      kind: 'booking',
      status: 'accepted',
      message: `probe-cards-rls fixture ${tag}`,
    })
    .select('id')
    .single();
  if (inbErr) throw new Error(`inbound insert: ${inbErr.message}`);
  created.inbound.push(inb.id);

  const { data: eng, error: engErr } = await admin
    .from('engagements')
    .insert({
      card_id: cardAnyone,
      seller_entity_id: sellerEntity,
      buyer_entity_id: buyerEntity,
      thread_id: th.id,
      inbound_id: inb.id,
      kind: 'booking',
      status: 'paid',
      scheduled_for: iso(Date.now() + 3 * 24 * 3600 * 1000),
      agreed_price_cents: 9500,
      currency: 'usd',
    })
    .select('id')
    .single();
  if (engErr) throw new Error(`engagement insert: ${engErr.message}`);
  created.engagements.push(eng.id);
  engagementId = eng.id;

  check(
    '1.1 fixture built',
    true,
    `seller=${sellerEntity} buyer=${buyerEntity} cardAnyone=${cardAnyone} cardVerified=${cardVerified} eng=${engagementId}`,
  );

  // ── 2. real sessions on the APP'S OWN ANON KEY ────────────────────────────
  console.log('\n=== 2  sign in (anon key + password — never service_role) ===');
  const signIn = async (label, user) => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error) throw new Error(`signIn(${label}): ${error.message}`);
    // ASSERTED, NOT ASSUMED. A silently failed sign-in would make every read
    // below return an anon-shaped empty set and the probe would report
    // "buyer cannot read" about a caller that was never signed in.
    if (!data.session?.access_token) throw new Error(`signIn(${label}): no access token`);
    check(`2.${label === 'buyer' ? 1 : 2} signed in as ${label}`, true, `user=${data.user.id}`);
    return client;
  };
  asBuyer = await signIn('buyer', buyerUser);
  asSeller = await signIn('seller', sellerUser);

  // ── 3. THE READS ──────────────────────────────────────────────────────────
  console.log('\n=== 3  A · buyer -> cards, direct, by id ===');
  const aAnyone = show(
    "A1 buyer reads seller's practice card, see_perm 'anyone'",
    await asBuyer.from('cards').select('id, kind, see_perm').eq('id', cardAnyone),
  );
  const aVerified = show(
    "A2 buyer reads seller's practice card, see_perm 'verified'",
    await asBuyer.from('cards').select('id, kind, see_perm').eq('id', cardVerified),
  );

  console.log('\n=== 4  B · buyer -> engagements + THE APP\'S OWN EMBED ===');
  console.log(`    embed string: ${JSON.stringify(APP_EMBED)}`);
  const bEmbed = show(
    'B1 buyer reads their engagement with the card embedded',
    await asBuyer.from('engagements').select(APP_EMBED).eq('id', engagementId),
  );

  console.log('\n=== 5  C/D · seller controls ===');
  const cAnyone = show(
    'C1 seller reads their OWN practice card',
    await asSeller.from('cards').select('id, kind, see_perm').eq('id', cardAnyone),
  );
  const dEmbed = show(
    'D1 seller reads the engagement with the card embedded',
    await asSeller.from('engagements').select(APP_EMBED).eq('id', engagementId),
  );

  // ── 6. what the readings mean ─────────────────────────────────────────────
  console.log('\n=== 6  findings ===');
  const rows = (r) => (Array.isArray(r.data) ? r.data.length : r.data ? 1 : 0);
  const embedKind = (r) => (Array.isArray(r.data) && r.data[0] ? (r.data[0].card?.kind ?? null) : null);

  // ABSENCE OF EVIDENCE IS REPORTED AS FAILURE: a read that ERRORED answers
  // nothing about RLS and must not be scored as "cannot read".
  for (const [label, r] of [
    ['A1', aAnyone], ['A2', aVerified], ['B1', bEmbed], ['C1', cAnyone], ['D1', dEmbed],
  ]) {
    check(`6.${label} read completed without a transport error`, !r.error,
      r.error ? `${r.error.code}: ${r.error.message}` : 'no error');
  }

  const buyerSeesCard = rows(aAnyone) > 0;
  const buyerEmbedKind = embedKind(bEmbed);
  const sellerSeesCard = rows(cAnyone) > 0;
  const sellerEmbedKind = embedKind(dEmbed);

  console.log('');
  console.log(`  buyer  · direct card read (see_perm 'anyone')   : ${buyerSeesCard ? 'ROW RETURNED' : 'NO ROW'}`);
  console.log(`  buyer  · direct card read (see_perm 'verified') : ${rows(aVerified) > 0 ? 'ROW RETURNED' : 'NO ROW'}`);
  console.log(`  buyer  · ENGAGEMENT_SELECT embed -> card.kind   : ${JSON.stringify(buyerEmbedKind)}`);
  console.log(`  seller · direct card read                       : ${sellerSeesCard ? 'ROW RETURNED' : 'NO ROW'}`);
  console.log(`  seller · ENGAGEMENT_SELECT embed -> card.kind   : ${JSON.stringify(sellerEmbedKind)}`);

  console.log('\n  VERDICT');
  if (!sellerSeesCard) {
    console.log(
      '  ** THE SELLER CANNOT READ THEIR OWN CARD. That is a larger finding than the one\n' +
        '     this probe went looking for: CardContext reads `cards` on every app launch, so\n' +
        '     either this fixture is unrepresentative or that read depends on something this\n' +
        '     probe did not reproduce. Investigate before drawing any conclusion about buyers.',
    );
  } else if (buyerEmbedKind === 'practice') {
    console.log(
      '  THE EMBED RESOLVES FOR THE PATIENT. useMyEngagements.cardKind is populated on a\n' +
        '  practice booking, so EngagementScreen names the 24-hour window and the "unknown"\n' +
        '  arm is a genuine edge (deleted card) rather than the common path.',
    );
  } else {
    console.log(
      '  ** THE EMBED DOES NOT RESOLVE FOR THE PATIENT. cardKind is null for every practice\n' +
        '     cancellation initiated from this app by a buyer, so the "unknown" arm is THE LIVE\n' +
        '     PATH, not a fallback: the patient is never told the 24-hour rule, only that the\n' +
        '     refund depends on notice we could not check. THIS IS A FINDING TO REPORT — the\n' +
        '     fix is a narrow network-side read (a card_kind column on an existing RPC, or a\n' +
        '     SECURITY DEFINER helper), NOT a widened RLS policy on `cards`.',
    );
  }
  console.log(
    `\n  (Seller-side embed = ${JSON.stringify(sellerEmbedKind)}. The clinician cancelling their own\n` +
      '   practice visit is the other half of the question, and it reads the same column.)',
  );
} catch (err) {
  failures += 1;
  console.error(`\nPROBE THREW: ${err.message}`);
} finally {
  // ── 7. teardown, ASSERTED ─────────────────────────────────────────────────
  console.log('\n=== 7  teardown (asserted by read-back) ===');
  const del = async (table, ids) => {
    if (ids.length === 0) return;
    const { error } = await admin.from(table).delete().in('id', ids);
    if (error) {
      failures += 1;
      console.log(`FAIL  delete ${table} — ${error.message}`);
      return;
    }
    const { data, error: readErr } = await admin.from(table).select('id').in('id', ids);
    if (readErr) {
      failures += 1;
      console.log(`FAIL  verify ${table} deletion — ${readErr.message}`);
      return;
    }
    check(`7.x ${table} removed`, (data ?? []).length === 0, `${ids.length} requested, ${(data ?? []).length} remain`);
  };
  // Children before parents: engagements -> inbound -> threads -> cards -> entities.
  await del('engagements', created.engagements);
  await del('inbound', created.inbound);
  await del('threads', created.threads);
  await del('cards', created.cards);
  await del('verifications', created.verifications);
  await del('entities', created.entities);
  for (const userId of created.users) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      failures += 1;
      console.log(`FAIL  delete auth user ${userId} — ${error.message}`);
    }
  }
  const { data: userCheck, error: userErr } = await admin
    .from('entities')
    .select('id')
    .in('id', created.entities);
  if (userErr) {
    failures += 1;
    console.log(`FAIL  final entity sweep — ${userErr.message}`);
  } else {
    check('7.z no fixture entity survives', (userCheck ?? []).length === 0);
  }

  console.log(`\n${failures === 0 ? 'OK' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

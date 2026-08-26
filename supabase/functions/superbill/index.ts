// supabase/functions/superbill/index.ts
//
// Issues the superbill for one wrapped, paid visit: renders the PDF, puts it in
// the private `superbills` bucket, and records it through issue_superbill (0042)
// — the one writer, which files the row and posts the announcing message in a
// single transaction.
//
// ─── WHY THIS IS AN EDGE FUNCTION AND NOT A WORKER ROUTE (ruling S8-1) ─────
// Two of the four inputs are SEALED to any client: `transactions` is RLS-on with
// no authenticated policies (hearth-network 0016:77-82 — 0023 returns a boolean
// on purpose), and `verifications` has its grants revoked (0035, re-asserted
// 0036). A client therefore cannot compose this document honestly. It is not a
// Worker route either: token-planes canon fixes that Worker at exactly two
// planes and says a third is a ruling, not a diff — and a superbill is
// agent-facing on neither.
//
// ─── AUTH SPLIT, COPIED FROM create-connect-account ───────────────────────
// anon client, auth plane only: auth.getUser(token) on the caller's own header.
// service-role client, data plane: everything else. The anon client never calls
// .from(). Same two-client shape as create-connect-account:65-93.
//
// ─── THE THREE GATES (ruling S8-4) ─────────────────────────────────────────
//   SELLER ONLY   a superbill is the clinician's statement about their own
//                 services; a buyer issuing one would be a patient authoring a
//                 provider's billing document.
//   WRAPPED ONLY  the codes live in visit_wraps. No wrap row, no superbill.
//   PAID ONLY     no succeeded charge, no superbill — refused by name. A visit
//                 with no payment wants a visit SUMMARY, a different document,
//                 not a superbill with a zero on it. (DEFERRED, with a trigger.)
// They live here and NOT in 0042 on purpose: this function must read
// transactions and visit_wraps to render the page anyway, and a second copy of
// the rule in SQL is the drift S5-11 named.
//
// ─── BYTES BEFORE BOOKKEEPING (BUG-016, ruled 2026-08-26) ─────────────────
// A receipt row with no object behind it is worse than a plain failure: a
// clinician hands a patient a link and both believe a document exists. So:
//   * NOTHING is recorded until the object has been STATTED — present, non-empty
//     and application/pdf. An upload reporting success is not the same fact as
//     bytes being addressable, and only one of those is what a patient clicks.
//   * NO signed URL is minted for a path that was not just verified. That
//     includes the already-issued path, which is where the hole actually lived:
//     row present + object gone returned a 200 and a dead link.
//   * NO field in a response is synthesised from a failed call. A null RPC
//     result is a 500 — the no-plausible-placeholder rule, applied to a response
//     shape rather than to a database column.
//
// ─── RECOVERY (ruled 2026-08-26) ───────────────────────────────────────────
// 0042's header claims the snapshot can re-render a lost document; that claim is
// now true. `{"recover": true}` re-prints from the FROZEN SNAPSHOT ALONE and
// never from a live row. It is opt-in on purpose: a missing file is answered by
// NAMING it, so nobody is handed a silently-regenerated document they did not
// ask for. The re-print is honest about being one — the bytes differ (pdf-lib
// stamps a creation date), the record does not.
//
// ─── ISSUE-ONCE (ruling S8-3) ──────────────────────────────────────────────
// The existing-superbill check happens BEFORE rendering, and 0042's UNIQUE is
// the backstop behind it. A second call returns the first document — same id,
// same path, same bytes. That is what makes the void proof structural: there is
// no path that reaches the renderer twice, so a licence voided after issue can
// never edit an issued receipt.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
// npm: specifier, NOT esm.sh — same reason create-connect-account uses it for
// Stripe: the esm.sh deno build polyfills Node builtins the Edge runtime removed.
// Pinned to the version hearth-network's verify script renders with, so the
// bytes it proves and the bytes this issues come off the same code path.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

import { compose, docFromSnapshot, issuedFromSnapshot, type ComposeInput } from './compose.ts';
import { renderSuperbill, type PdfLib } from './render.ts';
import { REFUSALS } from './copy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars (these are auto-injected by the Edge runtime).');
}

const BUCKET = 'superbills';
/** The pdf-lib slice render.ts asks for, bound once. */
const LIB: PdfLib = { PDFDocument, StandardFonts, rgb } as unknown as PdfLib;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Verifies the caller's JWT and returns their auth user id, or null. */
async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error) console.warn('[superbill] auth.getUser failed:', error);
    return null;
  }
  return data.user.id;
}

/**
 * UTC, and it says so. A PDF has no reader whose zone we know, so guessing one
 * would be the TZ-implicit formatting the DATE/TIME rule forbids. The label is
 * the honest alternative to a guess.
 */
function renderDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][d.getUTCMonth()];
  return `${day} ${month} ${d.getUTCFullYear()} (UTC)`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);

  let engagementId = '';
  let recover = false;
  try {
    const body = await req.json();
    engagementId = typeof body?.engagement_id === 'string' ? body.engagement_id.trim() : '';
    recover = body?.recover === true;
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'expected a json body' }, 400);
  }
  if (!engagementId) {
    return jsonResponse({ error: 'bad_request', message: 'engagement_id is required' }, 400);
  }

  const svc = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── the caller's entity ──────────────────────────────────────────────────
  const { data: entity, error: entityErr } = await svc
    .from('entities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (entityErr) {
    console.error('[superbill] entity lookup failed:', entityErr);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  if (!entity) return jsonResponse({ error: 'no_entity' }, 403);
  const callerEntityId = entity.id as string;

  // ── the engagement, and GATE 1: seller only ──────────────────────────────
  const { data: engagement, error: engErr } = await svc
    .from('engagements')
    .select('id, seller_entity_id, buyer_entity_id, thread_id, card_id, scheduled_for')
    .eq('id', engagementId)
    .maybeSingle();
  if (engErr) {
    console.error('[superbill] engagement lookup failed:', engErr);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  // Not-found and not-yours read the same to a stranger — no enumeration.
  if (!engagement || engagement.seller_entity_id !== callerEntityId) {
    return jsonResponse(
      { error: 'refused', message: engagement ? REFUSALS.notSeller : REFUSALS.noEngagement },
      403,
    );
  }

  // ── ISSUE-ONCE, checked before anything is rendered ──────────────────────
  const { data: existing, error: existingErr } = await svc
    .from('superbills')
    .select('id, storage_path, issued_at')
    .eq('engagement_id', engagementId)
    .maybeSingle();
  if (existingErr) {
    console.error('[superbill] existing lookup failed:', existingErr);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  if (existing) {
    // The first document IS the answer. Nothing is re-rendered, nothing is
    // re-uploaded, and no second message is posted (ruling S8-3/S8-5) — but the
    // OBJECT IS CHECKED FIRST. This is where BUG-016 lived: a row whose file had
    // gone still produced a 200 and a signed URL pointing at nothing.
    const path = existing.storage_path as string;
    if (await objectIsPresent(svc, path)) {
      return jsonResponse({
        superbill_id: existing.id,
        storage_path: path,
        issued_at: existing.issued_at,
        already_issued: true,
        signed_url: await signedUrl(svc, path),
      });
    }
    if (!recover) {
      // NAMED, never papered over, and never answered with a URL.
      return jsonResponse(
        { error: 'file_missing', message: REFUSALS.fileMissing,
          superbill_id: existing.id, storage_path: path },
        409,
      );
    }
    // Opt-in recovery: re-print from the snapshot and from NOTHING else.
    const { data: row, error: snapErr } = await svc
      .from('superbills').select('snapshot').eq('engagement_id', engagementId).maybeSingle();
    if (snapErr || !row?.snapshot) {
      console.error('[superbill] snapshot read failed:', snapErr);
      return jsonResponse({ error: 'lookup_failed' }, 500);
    }
    const fromSnapshot = docFromSnapshot(row.snapshot as Record<string, unknown>);
    const issuedOn = issuedFromSnapshot(row.snapshot as Record<string, unknown>);
    if (!fromSnapshot || !issuedOn) {
      // Fail CLOSED. A snapshot we cannot read is not a document we may guess at.
      return jsonResponse({ error: 'unrecoverable', message: REFUSALS.notRecoverable }, 409);
    }
    let reprinted: Uint8Array;
    try {
      reprinted = await renderSuperbill(LIB, fromSnapshot, { issued: issuedOn });
    } catch (err) {
      console.error('[superbill] re-render failed:', err);
      return jsonResponse({ error: 'render_failed' }, 500);
    }
    const restored = await putObject(svc, path, reprinted);
    if (!restored.ok) return jsonResponse({ error: restored.error }, 500);
    return jsonResponse({
      superbill_id: existing.id,
      storage_path: path,
      issued_at: existing.issued_at,
      already_issued: true,
      // Said out loud: a re-print of the same record, not the original file.
      // The bytes differ; what the page states does not.
      recovered: true,
      signed_url: await signedUrl(svc, path),
    });
  }

  // ── GATE 2: wrapped only ─────────────────────────────────────────────────
  const { data: wrap, error: wrapErr } = await svc
    .from('visit_wraps')
    .select(
      'visit_kind, cpt_code, icd_codes, duration_minutes, patient_name_for_billing, patient_dob',
    )
    .eq('engagement_id', engagementId)
    .maybeSingle();
  if (wrapErr) {
    console.error('[superbill] wrap lookup failed:', wrapErr);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  if (!wrap) return jsonResponse({ error: 'refused', message: REFUSALS.notWrapped }, 409);

  // ── GATE 3: paid only. The SEALED read (0016:77-82) ─────────────────────
  // Same predicate as cancel_engagement (0022) and get_my_engagement_settlement
  // (0023): a succeeded row, and 'refunded' is not 'succeeded'.
  const { data: payment, error: payErr } = await svc
    .from('transactions')
    .select('amount_cents, currency, updated_at')
    .eq('engagement_id', engagementId)
    .eq('status', 'succeeded')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (payErr) {
    console.error('[superbill] payment lookup failed:', payErr);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  if (!payment) return jsonResponse({ error: 'refused', message: REFUSALS.notPaid }, 409);

  // ── the stamps. The OTHER sealed read (0035/0036) ───────────────────────
  // LIVE ROWS ONLY — status='verified' and voided_at is null, which is exactly
  // verifications_live_stamp_idx (0036:155-157). Read ONCE, here, and frozen
  // into the snapshot: a licence voided next month never reaches this code again.
  const { data: verifications, error: verErr } = await svc
    .from('verifications')
    .select('type, registry_ref, checked_at, credential_class')
    .eq('entity_id', callerEntityId)
    .eq('status', 'verified')
    .is('voided_at', null)
    .in('type', ['npi', 'license']);
  if (verErr) {
    console.error('[superbill] verifications lookup failed:', verErr);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  const stamps = (verifications ?? []) as {
    type: string;
    registry_ref: string | null;
    checked_at: string | null;
    credential_class: string | null;
  }[];

  const { data: provider } = await svc
    .from('entities')
    .select('display_name')
    .eq('id', callerEntityId)
    .maybeSingle();

  // The slot's modality, where the visit had a booked time.
  const { data: slot } = await svc
    .from('card_slots')
    .select('modality')
    .eq('engagement_id', engagementId)
    .maybeSingle();

  // ── compose, render, upload, record ─────────────────────────────────────
  const issuedIso = new Date().toISOString();
  const checkedOn: Record<string, string> = {};
  for (const v of stamps) {
    const rendered = renderDate(v.checked_at);
    if (rendered) checkedOn[v.type] = rendered;
  }

  const input: ComposeInput = {
    engagementId,
    providerName: (provider?.display_name as string | null) ?? null,
    // 'doctoral' on ANY live row entitles the honorific (0036 §2).
    providerCredentialClass:
      stamps.find((v) => v.credential_class === 'doctoral')?.credential_class ?? null,
    verifications: stamps.map((v) => ({
      type: v.type,
      registry_ref: v.registry_ref,
      checked_at: v.checked_at,
    })),
    wrap: wrap as ComposeInput['wrap'],
    scheduledFor: (engagement.scheduled_for as string | null) ?? null,
    modality: (slot?.modality as string | null) ?? null,
    payment: {
      amount_cents: payment.amount_cents as number,
      currency: payment.currency as string,
      settled_at: payment.updated_at as string,
    },
    dates: {
      issued: renderDate(issuedIso)!,
      dateOfService: renderDate((engagement.scheduled_for as string | null) ?? null),
      paidOn: renderDate(payment.updated_at as string)!,
      checkedOn,
    },
  };

  const composed = compose(input);
  let bytes: Uint8Array;
  try {
    bytes = await renderSuperbill(LIB, composed, { issued: input.dates.issued });
  } catch (err) {
    console.error('[superbill] render failed:', err);
    return jsonResponse({ error: 'render_failed' }, 500);
  }

  // The path is DETERMINISTIC per superbill, but the id is minted by 0042 — so
  // the object is keyed on the engagement, which is what the storage policy
  // scopes on, and the file name is stable for a given visit. A retry after a
  // crash overwrites the same object rather than littering the bucket.
  const storagePath = `${engagementId}/superbill.pdf`;
  const stored = await putObject(svc, storagePath, bytes);
  if (!stored.ok) return jsonResponse({ error: stored.error }, 500);

  // UPLOAD BEFORE RECORD, deliberately. If this call fails, the object is an
  // orphan nobody was told about and the next attempt overwrites it. The inverse
  // — a message naming a file that is not there — is the one a person would hit.
  const { data: issued, error: issueErr } = await svc.rpc('issue_superbill', {
    p_engagement_id: engagementId,
    p_storage_path: storagePath,
    p_snapshot: composed.snapshot,
  });
  if (issueErr) {
    console.error('[superbill] issue_superbill failed:', issueErr);
    return jsonResponse({ error: 'issue_failed', message: issueErr.message }, 500);
  }

  // D1 (BUG-016): NO `??` FALLBACKS. A null result with no error is a failure,
  // and the old shape dressed it as a 200 carrying a path and a timestamp that
  // no row backed — a plausible placeholder in a response body.
  if (!issued?.superbill_id) {
    console.error('[superbill] issue_superbill returned no row', { engagementId });
    return jsonResponse({ error: 'issue_failed', message: 'the superbill was not recorded' }, 500);
  }

  return jsonResponse({
    superbill_id: issued.superbill_id,
    storage_path: issued.storage_path,
    issued_at: issued.issued_at,
    already_issued: issued.idempotent === true,
    signed_url: await signedUrl(svc, storagePath),
  });
});

/**
 * Is the object actually there? (D2/D3, BUG-016.)
 *
 * `list` with a search on the exact file name, rather than a HEAD of a signed
 * URL: the storage LIST is the same catalogue a download reads from, it needs no
 * URL to be minted first, and it hands back size and mimetype in the same call.
 * A signed HEAD would also 200 for a path that does not exist until the GET.
 *
 * Requires PRESENT, NON-EMPTY and application/pdf. A zero-byte object is the
 * failure this whole change exists to catch: storage happily accepts one, and
 * every downstream check that only asks "does the key exist" would pass it.
 */
async function objectIsPresent(
  svc: ReturnType<typeof createClient>,
  path: string,
): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = slash === -1 ? '' : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const { data, error } = await svc.storage.from(BUCKET).list(folder, { search: name, limit: 1 });
  if (error) {
    console.error('[superbill] object stat failed:', error);
    return false;
  }
  const found = (data ?? []).find((o: { name: string }) => o.name === name) as
    | { name: string; metadata?: { size?: number; mimetype?: string } }
    | undefined;
  if (!found) return false;
  const size = found.metadata?.size ?? 0;
  const mime = found.metadata?.mimetype ?? '';
  if (size <= 0 || mime !== 'application/pdf') {
    console.error('[superbill] object present but unfit', { path, size, mime });
    return false;
  }
  return true;
}

/**
 * Upload, then PROVE it landed. BYTES BEFORE BOOKKEEPING: an upload that reports
 * success is not the same fact as an object a patient can open, and the whole of
 * BUG-016 is the distance between those two sentences. Nothing downstream of
 * this — no superbills row, no message, no signed URL, no 200 — happens unless
 * this returns ok.
 */
async function putObject(
  svc: ReturnType<typeof createClient>,
  path: string,
  bytes: Uint8Array,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('[superbill] upload failed:', error);
    return { ok: false, error: 'upload_failed' };
  }
  if (!(await objectIsPresent(svc, path))) {
    console.error('[superbill] upload reported success but the object is not addressable', { path });
    return { ok: false, error: 'upload_unverified' };
  }
  return { ok: true };
}

/**
 * A short-lived link, returned so the wrap screen can hand the document over
 * without a second round trip. It is NOT what gets stored: the message payload
 * carries the PATH, because a signed URL expires and a message does not.
 * Ten minutes is enough to open or save it and short enough that a forwarded
 * link is not a standing key to someone's diagnosis codes.
 */
async function signedUrl(
  svc: ReturnType<typeof createClient>,
  path: string,
): Promise<string | null> {
  const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) {
    console.warn('[superbill] signed url failed:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

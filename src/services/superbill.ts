// src/services/superbill.ts
//
// The app's caller for the `superbill` Edge Function (PLEXMED S8).
//
// WHY THIS FILE EXISTS AT ALL. The function has been built, deployed and proven
// live since 2026-08-26 and NOTHING IN THE APP CALLED IT — a clinician could not
// produce a superbill by any means, and the only ones in existence were made by
// curl. Every S8 proof was server-side and correct; none of them asserted that a
// caller existed, and the verify script IS a caller, so the surface looked
// exercised. THE GAP WAS BETWEEN A GREEN VERIFY AND A REACHABLE FEATURE.
//
// ─── REFUSALS ARE MATCHED BY MESSAGE, NEVER BY STATUS CODE ─────────────────
// The function answers four different refusals across two status codes:
// `notSeller` and `noEngagement` share 403; `notWrapped`, `notPaid` and
// `file_missing` share 409. A caller that branched on the number would tell a
// clinician their visit was unpaid when it was in fact unwrapped. This is the
// VERIFICATION DISCIPLINE rule's first clause, and that clause was written
// about this exact function. The `error` field discriminates the SHAPE
// (file_missing carries ids); the `message` is the approved copy and is what a
// person reads (supabase/functions/superbill/copy.ts, APPROVED VERBATIM S8-7).
//
// ─── THE BODY OF A REFUSAL LIVES BEHIND error.context ──────────────────────
// @supabase/supabase-js ^2.105.4: a non-2xx from functions.invoke resolves to a
// FunctionsHttpError and `data` IS NULL — the Response is on `error.context`.
// Every refusal above is a non-2xx, so the followup.ts shape
// (`if (error) console.warn(...)`) would discard every message this feature
// exists to render. That is why this module looks different from its siblings.
//
// ─── THE SIGNED URL IS MINTED PER TAP, NEVER STORED ────────────────────────
// A signed URL lives 600 seconds (superbill/index.ts:465-474). The DURABLE
// artefact is the storage PATH, which issue_superbill puts in the thread
// message's payload (0042:134-138) — a URL expires and a message does not. So
// nothing here caches a link: the issue call's own `signed_url` is used
// immediately, and every later tap calls signedSuperbillUrl() again. A
// clinician never meets the expiry, and there is no countdown to render.
//
// Both parties may open it: pos-0005's storage policy scopes reads to either
// side of the engagement, because a superbill has two rightful readers, not one.

import { supabase } from './supabase';

/** The private bucket (hearth-pos migration 0005). */
const BUCKET = 'superbills';

/** Matches the function's own link lifetime (superbill/index.ts:469). */
const SIGNED_URL_SECONDS = 600;

export interface SuperbillIssued {
  superbillId: string;
  /** The durable pointer. Mint links from this; never store a link. */
  storagePath: string;
  issuedAt: string;
  /** ISSUE-ONCE (S8-3): true means this tap returned the FIRST document. */
  alreadyIssued: boolean;
  /** True only on the opt-in recovery path — same record, re-printed bytes. */
  recovered: boolean;
  /** Fresh at the moment of the call. Null when the link could not be minted. */
  signedUrl: string | null;
}

export type SuperbillFailure =
  /** A named refusal. `message` is approved copy and is safe to show verbatim. */
  | { reason: 'refused'; message: string }
  /** The row exists, the object is gone. Re-issuable with recover (S8/BUG-016). */
  | { reason: 'file_missing'; message: string; superbillId: string; storagePath: string }
  | { reason: 'unauthenticated' }
  | { reason: 'request_failed' };

export type SuperbillResult =
  | { ok: true; value: SuperbillIssued }
  | ({ ok: false } & SuperbillFailure);

/**
 * The refusal body, or null.
 *
 * Reads `error.context` rather than `data`, for the reason in the header. A
 * Response body may be consumed once, and this is the only place that does it.
 */
async function readRefusal(
  err: unknown,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const context = (err as { context?: unknown })?.context;
  if (context === null || typeof context !== 'object') return null;
  const response = context as Partial<Response>;
  if (typeof response.json !== 'function') return null;
  try {
    const body = (await (response as Response).json()) as Record<string, unknown>;
    return { status: typeof response.status === 'number' ? response.status : 0, body };
  } catch (parseErr) {
    // A refusal we cannot read is NOT a refusal we may guess at. Logged with
    // its value, never swallowed.
    console.warn('[superbill] could not read refusal body:', parseErr);
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Issues the superbill for one wrapped, paid visit — or returns the one already
 * issued, which is the same answer (S8-3).
 *
 * `recover` is the opt-in re-print of a receipt whose file has gone. It is
 * NEVER passed speculatively: the function names `file_missing` first, and the
 * caller offers the re-print to the clinician rather than performing it behind
 * their back.
 */
export async function issueSuperbill(
  engagementId: string,
  opts?: { recover?: boolean },
): Promise<SuperbillResult> {
  const { data, error } = await supabase.functions.invoke('superbill', {
    body: { engagement_id: engagementId, recover: opts?.recover === true },
  });

  if (error) {
    const refusal = await readRefusal(error);
    if (!refusal) {
      console.warn('[superbill] invoke failed with no readable body:', error);
      return { ok: false, reason: 'request_failed' };
    }
    const kind = asString(refusal.body.error);
    const message = asString(refusal.body.message);
    console.warn('[superbill] refused:', {
      engagementId,
      status: refusal.status,
      kind,
      // The message is approved copy, not PHI — safe to log and useful to have.
      message,
    });

    if (kind === 'unauthorized') return { ok: false, reason: 'unauthenticated' };

    if (kind === 'file_missing') {
      const superbillId = asString(refusal.body.superbill_id);
      const storagePath = asString(refusal.body.storage_path);
      // The shape is only usable with BOTH ids. Without them there is nothing
      // to offer a re-print of, so it degrades to the plain refusal rather
      // than to a button that cannot work.
      if (message && superbillId && storagePath) {
        return { ok: false, reason: 'file_missing', message, superbillId, storagePath };
      }
      return message
        ? { ok: false, reason: 'refused', message }
        : { ok: false, reason: 'request_failed' };
    }

    // 'refused' and 'unrecoverable' both carry approved copy. Anything else
    // (lookup_failed / render_failed / upload_failed / upload_unverified /
    // issue_failed) is an internal fault with no clinician-facing sentence —
    // and a raw internal string must NOT be dressed up as one.
    if (message && (kind === 'refused' || kind === 'unrecoverable')) {
      return { ok: false, reason: 'refused', message };
    }
    return { ok: false, reason: 'request_failed' };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  const superbillId = asString(body.superbill_id);
  const storagePath = asString(body.storage_path);
  const issuedAt = asString(body.issued_at);
  // NO `??` FALLBACKS (BUG-016's D1). A 200 whose body has no id is a failure,
  // and the old shape of this bug dressed exactly that as success — a path and
  // a timestamp no row backed. A plausible placeholder on a receipt is the
  // worst possible place for one.
  if (!superbillId || !storagePath || !issuedAt) {
    console.error('[superbill] 200 with an incomplete body', { engagementId, data });
    return { ok: false, reason: 'request_failed' };
  }

  return {
    ok: true,
    value: {
      superbillId,
      storagePath,
      issuedAt,
      alreadyIssued: body.already_issued === true,
      recovered: body.recovered === true,
      signedUrl: asString(body.signed_url),
    },
  };
}

/**
 * A fresh link for a superbill already issued — the thread message's tap.
 *
 * The clinician's own session mints it; pos-0005's participant policy is what
 * allows it, and it allows the PATIENT equally (0005:31-34). Nothing is stored:
 * the next tap mints the next link.
 */
export async function signedSuperbillUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error) {
    console.warn('[superbill] signed url failed:', { storagePath, error });
    return null;
  }
  return asString(data?.signedUrl);
}

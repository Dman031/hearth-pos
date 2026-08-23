// src/services/credentials.ts
//
// Credential verification — the SUBMIT side of the ELECTRONIC ceremony.
//
// A vendor submits a registry number (an NPI, or an Oregon board licence).
// The app calls request_credential_verification() (hearth-network migration
// 0035), which mints a 'pending' row in public.verifications and returns a
// status string. A scheduled drain then checks that number against the
// primary source itself — the U.S. provider registry for an NPI, the Oregon
// licensing board's own register for a licence, plus the federal exclusions
// list — and compares the name on the record against the name on the
// vendor's completed identity check. That takes about a minute. There is no
// queue, no reviewer, and no approve button: pos-0004 dropped the last one.
//
// The VERDICT is never written by this client. entities.credential_verified
// has exactly ONE writer — record_verification_outcome (0035, service role)
// — which derives it from a live verified licence row. Ruling R4 means there
// is no override path: nothing in the app can move a row to 'verified'.
//
// 'manual_review' means an AUTOMATED check was inconclusive (an unparseable
// discipline record, an ambiguous exclusions name hit, or a number already
// live-bound to another entity). It does NOT mean a human is reviewing it.
// Do not describe it that way to a vendor.
//
// GATE (R-GAP): the RPC refuses unless the caller is id_verified AND has an
// entity_identity_sessions row. The flag alone is insufficient — the
// ceremony needs the Stripe session to fetch the verified name server-side.
//
// This module returns RAW STATUSES ONLY. Vendor-facing copy for every state
// is ruled separately (S3-2 cold-arrival copy, docs/CRED_S3_COLD_FLOW_SPEC.md)
// and belongs in the screens session — never here.

import { supabase } from './supabase';
import type { Verification } from '../types/verification';

/** The Oregon boards the ceremony can reach today (0035:190). */
export const SUPPORTED_BOARDS = ['omb', 'oblpct', 'obop'] as const;
export type CredentialBoard = (typeof SUPPORTED_BOARDS)[number];

/** The credential kinds a vendor may submit (0035:184-200). */
export type CredentialSubmitType = 'npi' | 'license';

export interface CredentialRequestInput {
  type: CredentialSubmitType;
  /** The registry number: 10 NPI digits, or the licence number as issued. */
  number: string;
  /** Required iff type === 'license'; must be null/omitted for 'npi'. */
  board?: CredentialBoard | null;
}

/**
 * What the RPC reports back. 'pending' — the ceremony is queued (a repeat tap
 * while one is in flight is a server-side no-op and also returns 'pending').
 * 'manual_review' — an R4 collision was pre-detected at request time.
 */
export type CredentialRequestStatus = 'pending' | 'manual_review';

export type CredentialRequestResult =
  | { ok: true; status: CredentialRequestStatus }
  | { ok: false; reason: CredentialRequestFailure };

export type CredentialRequestFailure =
  | 'unauthenticated' // no signed-in vendor / no usable session
  | 'identity_not_verified' // R-GAP: needs id_verified AND an identity session
  | 'invalid_input' // bad type, bad number format, missing/unknown board
  | 'request_failed'; // network, RLS, or any unclassified server failure

const NPI_PATTERN = /^[0-9]{10}$/;
const LICENSE_PATTERN = /^[A-Za-z0-9-]{1,20}$/;

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

function isBoard(value: unknown): value is CredentialBoard {
  return (
    typeof value === 'string' && (SUPPORTED_BOARDS as readonly string[]).includes(value)
  );
}

/**
 * Classify a PostgREST/Postgres error into a caller-facing failure reason.
 *
 * The RPC raises with explicit SQLSTATEs (0035:171-199), but P0001 is also
 * Postgres's DEFAULT raise code — so identity_not_verified is matched on the
 * MESSAGE, never on the code alone, or a future unrelated P0001 would be
 * misreported as an identity problem.
 */
function classifyRpcError(err: unknown): CredentialRequestFailure {
  const code = typeof (err as { code?: unknown })?.code === 'string'
    ? String((err as { code: string }).code)
    : '';
  const message = typeof (err as { message?: unknown })?.message === 'string'
    ? String((err as { message: string }).message)
    : '';

  if (message.includes('identity_not_verified')) return 'identity_not_verified';
  if (code === '28000' || message.includes('unauthenticated')) return 'unauthenticated';
  // No/expired JWT is rejected by PostgREST before the function ever runs.
  if (code === 'PGRST301' || code === '401' || /\bJWT\b/i.test(message)) {
    return 'unauthenticated';
  }
  if (code === '22023') return 'invalid_input';
  return 'request_failed';
}

/**
 * Submits a registry number for electronic verification. Resolves nothing
 * client-side — current_entity_id() derives the entity server-side from the
 * session. Returns the ceremony's status, never a row id and never a
 * snapshot. Never throws.
 *
 * The format checks below mirror the RPC's own regexes for fast feedback.
 * The RPC remains authoritative: it re-checks everything server-side
 * (PROMPT-CODE CONTRACT — code is the guarantee, not the client).
 */
export async function requestCredentialVerification(
  input: CredentialRequestInput,
): Promise<CredentialRequestResult> {
  const number = input.number.trim();

  if (input.type !== 'npi' && input.type !== 'license') {
    return { ok: false, reason: 'invalid_input' };
  }

  let board: CredentialBoard | null = null;
  if (input.type === 'npi') {
    if (!NPI_PATTERN.test(number)) return { ok: false, reason: 'invalid_input' };
  } else {
    if (!isBoard(input.board)) return { ok: false, reason: 'invalid_input' };
    if (!LICENSE_PATTERN.test(number)) return { ok: false, reason: 'invalid_input' };
    board = input.board;
  }

  const { data, error } = await supabase.rpc('request_credential_verification', {
    p_type: input.type,
    p_number: number,
    p_board: board,
  });

  if (error) {
    const reason = classifyRpcError(error);
    console.warn('[credentials] request_credential_verification failed:', {
      reason,
      type: input.type,
      board,
      error,
    });
    return { ok: false, reason };
  }

  // The RPC's contract is a status string and nothing else. Anything outside
  // the two documented values means the contract moved — fail loudly rather
  // than casting a surprise into a success.
  if (data !== 'pending' && data !== 'manual_review') {
    console.warn(
      '[credentials] request_credential_verification returned an unexpected value:',
      data,
    );
    return { ok: false, reason: 'request_failed' };
  }

  console.log('[credentials] credential verification requested', {
    type: input.type,
    board,
    status: data,
  });
  return { ok: true, status: data };
}

/**
 * Reads the owner's verification receipts via get_my_verifications() (0035),
 * newest first. Status columns only — scoped server-side to
 * current_entity_id(). Returns an Error rather than throwing so the polling
 * hook can surface it without unmounting.
 */
export async function fetchMyVerifications(): Promise<
  { ok: true; verifications: Verification[] } | { ok: false; error: Error }
> {
  const { data, error } = await supabase.rpc('get_my_verifications');
  if (error) {
    return { ok: false, error: toError(error, 'load verifications') };
  }
  return { ok: true, verifications: (data ?? []) as Verification[] };
}

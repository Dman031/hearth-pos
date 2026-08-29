// src/services/inquiry.ts
//
// The pre-decision conversation (hearth-network migration 0040).
//
// A clinician may ask ONE question before accepting or declining. Nothing is
// charged while a question is open, and the time stays held until its deadline.
//
// THE CHIP SURFACE READS EXACTLY WHAT get_my_pending_requests RETURNS, AND THAT
// COLUMN LIST IS A RULING (S6-6), not an oversight. There is no display_name,
// no deus_id, and no other verification flag: PRE-ACCEPT THE PERSON KNOCKING
// STAYS UNNAMED. get_my_thread_peers (0007) requires an established thread for
// the same reason. A chip surface grows to fit whatever its read returns — so
// this read must not be widened to make a screen easier.
//
// The call is zero-arg and self-scoped. There is no parameter with which to ask
// about anyone else's inbox.

import { supabase } from './supabase';

/**
 * Where the pre-decision conversation stands.
 *   none            — nothing asked yet (T1)
 *   awaiting_them   — the clinician asked; the patient has not answered (T2)
 *   they_answered   — the patient replied; it is the clinician's move (T3)
 */
export type ConversationState = 'none' | 'awaiting_them' | 'they_answered';

export interface PendingRequest {
  inbound_id: string;
  /** Feeds the identity chip. Renders in BOTH states — a missing chip and an
   *  unverified person must never look alike on a clinical surface. */
  sender_id_verified: boolean;
  /** Feeds the history chip. "New patient" is never used: new vs. established
   *  patient is a billing distinction this network cannot make. */
  first_contact: boolean;
  conversation: ConversationState;
  /** The live hold deadline. NULL once the hold has lapsed (T4). */
  held_until: string | null;
}

export type InquiryFailure =
  | 'unauthenticated'
  | 'already_decided' // the request was accepted or declined while composing
  | 'no_open_question' // out of turn — nothing was asked
  | 'awaiting_their_reply' // one question at a time
  | 'request_failed';

export type InquiryResult<T> = { ok: true; value: T } | { ok: false; reason: InquiryFailure };

/** Same `(code: …)` convention as the slot RPCs; several raise with P0001, so
 *  the token is matched rather than the SQLSTATE. */
function classify(err: unknown): InquiryFailure {
  const message =
    typeof (err as { message?: unknown })?.message === 'string'
      ? String((err as { message: string }).message)
      : '';
  const code =
    typeof (err as { code?: unknown })?.code === 'string'
      ? String((err as { code: string }).code)
      : '';
  if (code === 'PGRST301' || code === '401' || /\bJWT\b/i.test(message)) {
    return 'unauthenticated';
  }
  switch (/\(code:\s*([A-Z_]+)\)/.exec(message)?.[1]) {
    case 'REQUEST_ALREADY_DECIDED':
      return 'already_decided';
    case 'NO_OPEN_QUESTION':
      return 'no_open_question';
    case 'AWAITING_THEIR_REPLY':
      return 'awaiting_their_reply';
    default:
      return 'request_failed';
  }
}

/** The caller's own pending requests, with the facts each chip states. */
export async function fetchPendingRequests(): Promise<InquiryResult<PendingRequest[]>> {
  const { data, error } = await supabase.rpc('get_my_pending_requests');
  if (error) {
    const reason = classify(error);
    console.warn('[inquiry] get_my_pending_requests failed:', { reason, error });
    return { ok: false, reason };
  }
  return { ok: true, value: (data ?? []) as PendingRequest[] };
}

/**
 * Asks a question on a pending request, or answers one.
 *
 * ONE QUESTION AT A TIME, enforced server-side: a second message before the
 * other party replies raises AWAITING_THEIR_REPLY. The composer disables itself
 * to describe that rule; the RPC is what guarantees it.
 *
 * `p_from_entity_id` is deliberately omitted — the sender is derived from the
 * session, exactly as post_message does it, so nothing here can speak as
 * someone else.
 */
export async function postInquiryMessage(
  inboundId: string,
  body: string,
): Promise<InquiryResult<{ message_id: string; thread_id: string }>> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'request_failed' };

  const { data, error } = await supabase.rpc('post_inquiry_message', {
    p_inbound_id: inboundId,
    p_body: trimmed,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[inquiry] post_inquiry_message failed:', { reason, inboundId, error });
    return { ok: false, reason };
  }
  const messageId = (data as { message_id?: unknown })?.message_id;
  const threadId = (data as { thread_id?: unknown })?.thread_id;
  if (typeof messageId !== 'string' || typeof threadId !== 'string') {
    console.warn('[inquiry] post_inquiry_message returned an unexpected value:', data);
    return { ok: false, reason: 'request_failed' };
  }
  return { ok: true, value: { message_id: messageId, thread_id: threadId } };
}

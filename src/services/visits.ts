// src/services/visits.ts
//
// Today, the visit, and the wrap (hearth-network migration 0041).
//
// ─── THE PLAN INDEX IS OFF BY ONE, AND THAT IS THE POINT ────────────────────
// set_plan_item takes a 0-BASED index: it rejects p_index < 0, rejects
// p_index >= jsonb_array_length(items), and reads v_items ->> p_index, which is
// 0-based jsonb subscripting (0041:428-465).
// get_messages emits n as 1-BASED: items.push({ n: i + 1, text }) — because n is
// the number a PERSON says out loud (hearth-network src/tools/get-messages.ts:85).
//
// SO: THE NUMBER SHOWN IS n; THE NUMBER WRITTEN IS n - 1. A screen that displays
// the array index would show "item 0". A screen that passes the displayed number
// would toggle the wrong line. Either way a patient saying "item 2" and a
// clinician looking at item 2 would mean different things — on a plan that is a
// care instruction, not a UI nit. The conversion lives HERE, once, in
// planItemDisplayNumber / planItemWriteIndex, and nowhere else.
//
// DONE-STATE IS FOLDED, NEVER INVENTED. A check-off is a NEW MESSAGE, never an
// edit (S7-5) — the plan message itself is immutable. The latest plan_item row
// per index wins. get_my_day returns the same fold as plan_items_done /
// plan_items_total, so a tile and an open conversation cannot disagree.
//
// wrap_visit IS ONE TRANSACTION. It upserts the record, posts the plan, sets the
// cadence and completes the visit together — A HALF-WRAP IS NOT A STATE. This
// module therefore makes ONE call with every field, and never a sequence of
// smaller ones that could strand between them.

import { supabase } from './supabase';

/** One row of get_my_day. Column list is authoritative per 0041. */
export interface DayVisit {
  engagement_id: string;
  thread_id: string | null;
  card_id: string | null;
  card_kind: string | null;
  engagement_kind: string | null;
  scheduled_for: string | null;
  ends_at: string | null;
  modality: string | null;
  status: string;
  visit_started_at: string | null;
  fulfilled_at: string | null;
  agreed_price_cents: number | null;
  currency: string | null;
  room_url: string | null;
  first_visit_on_network: boolean;
  plan_message_id: string | null;
  plan_items_total: number | null;
  plan_items_done: number | null;
}

/** The tile state is DERIVED (S7-8); engagement_status did not grow a value. */
export type VisitState = 'scheduled' | 'in_visit' | 'wrapped' | 'cancelled';

/**
 * Derives the tile state.
 *
 * NOTE `cancelled_at` IS NOT USED and cannot be: get_my_day does not return it.
 * The spec's pseudocode names it, which is a benign spec/contract mismatch
 * recorded under N-15 — `status = 'cancelled'` carries exactly the same fact,
 * so nothing is owed and nothing should be widened to "fix" it.
 */
export function deriveVisitState(v: DayVisit): VisitState {
  if (v.status === 'cancelled') return 'cancelled';
  if (v.fulfilled_at !== null) return 'wrapped';
  if (v.visit_started_at !== null) return 'in_visit';
  return 'scheduled';
}

/** Array position → the number a person says. See the header. */
export function planItemDisplayNumber(arrayIndex: number): number {
  return arrayIndex + 1;
}

/** The number a person says → the index set_plan_item takes. See the header. */
export function planItemWriteIndex(displayNumber: number): number {
  return displayNumber - 1;
}

export type VisitFailure =
  | 'unauthenticated'
  | 'not_seller'
  | 'already_wrapped'
  | 'no_plan'
  | 'plan_too_many'
  // queue_ehr_push's own two (0045:220-229). NOT_WRAPPED is gated at enqueue
  // rather than in the drain, deliberately — 0045:183-186: the drain has no
  // user to tell, and a raise here reaches the finger that tapped.
  | 'not_wrapped'
  | 'cancelled'
  | 'request_failed';

export type VisitResult<T> = { ok: true; value: T } | { ok: false; reason: VisitFailure };

function classify(err: unknown): VisitFailure {
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
    case 'UNAUTHENTICATED':
      return 'unauthenticated';
    case 'ALREADY_WRAPPED':
      return 'already_wrapped';
    case 'NO_PLAN':
      return 'no_plan';
    case 'NOT_WRAPPED':
      return 'not_wrapped';
    default:
      break;
  }
  // These four raise without a code token; matched on the message, which is
  // stable in the migration and not user-facing either way.
  if (/caller is not the seller/i.test(message)) return 'not_seller';
  if (/at most 20 items/i.test(message)) return 'plan_too_many';
  if (/is cancelled \(terminal\)/i.test(message)) return 'cancelled';
  return 'request_failed';
}

/**
 * Today's read. BOTH ARGUMENTS ARE UTC INSTANTS THE CLIENT COMPUTES (S7-2) —
 * there is no "today" parameter and there will not be one, because "today" is a
 * client rendering of a zone the server does not hold.
 */
export async function fetchMyDay(from: Date, to: Date): Promise<VisitResult<DayVisit[]>> {
  const { data, error } = await supabase.rpc('get_my_day', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] get_my_day failed:', { reason, error });
    return { ok: false, reason };
  }
  return { ok: true, value: (data ?? []) as DayVisit[] };
}

/** Seller-only, idempotent; refuses a cancelled or already-wrapped visit. */
export async function startVisit(engagementId: string): Promise<VisitResult<true>> {
  const { error } = await supabase.rpc('start_visit', { p_engagement_id: engagementId });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] start_visit failed:', { reason, engagementId, error });
    return { ok: false, reason };
  }
  return { ok: true, value: true };
}

export interface WrapInput {
  engagementId: string;
  visitKind: 'new' | 'follow_up' | null;
  cptCode: string | null;
  icdCodes: string[] | null;
  durationMinutes: number | null;
  patientName: string | null;
  /** YYYY-MM-DD, as the clinician typed it. Nothing on the network checks it. */
  patientDob: string | null;
  planItems: string[] | null;
  nudgeAfterDays: number | null;
}

/**
 * The whole wrap in ONE call. Every argument after the engagement is optional,
 * and the RPC upserts the record, posts the plan, sets the cadence and completes
 * the visit in a single transaction. Do not decompose this into steps: a
 * half-wrap is not a state, and a sequence could strand between them.
 */
export async function wrapVisit(input: WrapInput): Promise<VisitResult<true>> {
  const { error } = await supabase.rpc('wrap_visit', {
    p_engagement_id: input.engagementId,
    p_visit_kind: input.visitKind,
    p_cpt_code: input.cptCode,
    p_icd_codes: input.icdCodes,
    p_duration_minutes: input.durationMinutes,
    p_patient_name: input.patientName,
    p_patient_dob: input.patientDob,
    p_plan_items: input.planItems,
    p_nudge_after_days: input.nudgeAfterDays,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] wrap_visit failed:', { reason, engagementId: input.engagementId, error });
    return { ok: false, reason };
  }
  return { ok: true, value: true };
}

/** Revising a plan AFTER the wrap. wrap_visit will not post a second one. */
export async function postVisitPlan(
  engagementId: string,
  items: string[],
): Promise<VisitResult<true>> {
  const { error } = await supabase.rpc('post_visit_plan', {
    p_engagement_id: engagementId,
    p_items: items,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] post_visit_plan failed:', { reason, engagementId, error });
    return { ok: false, reason };
  }
  return { ok: true, value: true };
}

/** Checks one plan line off. `displayNumber` is what the person sees (1-based). */
export async function setPlanItem(
  engagementId: string,
  displayNumber: number,
  done: boolean,
): Promise<VisitResult<true>> {
  const { error } = await supabase.rpc('set_plan_item', {
    p_engagement_id: engagementId,
    p_index: planItemWriteIndex(displayNumber),
    p_done: done,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] set_plan_item failed:', { reason, engagementId, displayNumber, error });
    return { ok: false, reason };
  }
  return { ok: true, value: true };
}

export interface FollowupDue {
  thread_id: string;
  last_message_at: string | null;
  nudge_after_days: number | null;
  due_at: string | null;
}

/**
 * The conversations whose cadence has elapsed. A PREDICATE evaluated when
 * someone looks — nothing runs on a timer, nothing is drafted, and nothing is
 * sent. Tapping one opens a draft; sending is the ordinary post_message.
 */
export async function fetchFollowupsDue(): Promise<VisitResult<FollowupDue[]>> {
  const { data, error } = await supabase.rpc('get_my_followups_due');
  if (error) {
    const reason = classify(error);
    console.warn('[visits] get_my_followups_due failed:', { reason, error });
    return { ok: false, reason };
  }
  return { ok: true, value: (data ?? []) as FollowupDue[] };
}

// ─── PLEXMED S10 · THE PUSH ─────────────────────────────────────────────────
//
// TAPPED, NEVER TRIGGERED (S10-5). There is no trigger on visit_wraps, no
// enqueue inside wrap_visit and no auto-push on the fulfilled transition. This
// module exists so that the ONLY way a patient's name, date of birth and
// diagnoses reach a third-party server is a clinician's finger. A future caller
// that queues from anything other than a tap breaks the ruling, not the code.
//
// STATUS IS A ROW, NOT A MESSAGE (S10-14). Nothing about a push reaches the
// patient's conversation — that would put clinician operational noise into a
// clinical thread. get_my_ehr_pushes is the ONE read of it.

/** One row of get_my_ehr_pushes. Column list is authoritative per 0045:290-303. */
export interface EhrPush {
  outbox_id: string;
  engagement_id: string;
  target: string;
  /** pending | sending | sent | failed | skipped (0045:134-135). */
  status: string;
  attempts: number;
  pushed_at: string | null;
  /** One of SEVEN values; see visit-copy.ts. Null on every non-skipped row. */
  skipped_reason: string | null;
  /** Rides on a row that SUCCEEDED. An omission is NOT a skip (S10-9). */
  omissions: string[] | null;
  /** The target server's own text, capped and scrubbed — safe to show. */
  last_error: string | null;
  remote_ids: Record<string, unknown> | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueuedPush {
  outbox_id: string;
  status: string;
  /** True when a terminal failed/skipped row was reset to pending (0045:245-253). */
  requeued: boolean;
}

/**
 * The tap. Seller-only, and a SECOND TAP IS NOT A SECOND PUSH — dedupe_key's
 * UNIQUE makes the insert a no-op and the existing row comes back (0045:233-260).
 * A `failed` or `skipped` row is re-queued; a `sent` row is a DELIBERATE no-op,
 * so the caller must read `status` back rather than assume it sent something.
 */
export async function queueEhrPush(engagementId: string): Promise<VisitResult<QueuedPush>> {
  // p_target is left to its default: 'medplum' is the only value 0045's CHECK
  // admits, and naming a vendor at a call site is what S10-2 keeps out of the
  // app. Pointing at another server is a migration, never a screen.
  const { data, error } = await supabase.rpc('queue_ehr_push', {
    p_engagement_id: engagementId,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] queue_ehr_push failed:', { reason, engagementId, error });
    return { ok: false, reason };
  }
  const row = (data ?? {}) as { outbox_id?: string; status?: string; requeued?: boolean };
  // NO `??` FALLBACK ON THE ID (BUG-016's D1). A null result with no error is a
  // failure, and dressing it as a queued push would be a plausible placeholder
  // in the one place a clinician reads to learn whether anything happened.
  if (!row.outbox_id || !row.status) {
    console.error('[visits] queue_ehr_push returned no row', { engagementId, data });
    return { ok: false, reason: 'request_failed' };
  }
  return {
    ok: true,
    value: { outbox_id: row.outbox_id, status: row.status, requeued: row.requeued === true },
  };
}

/**
 * Every push the caller owns, newest first. The null argument is the shape
 * 0045:283 names for exactly this — "what a Today strip needs" — so the screen
 * makes ONE call and indexes it, rather than one call per wrapped tile.
 */
export async function fetchEhrPushes(
  engagementId?: string,
): Promise<VisitResult<EhrPush[]>> {
  const { data, error } = await supabase.rpc('get_my_ehr_pushes', {
    p_engagement_id: engagementId ?? null,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[visits] get_my_ehr_pushes failed:', { reason, engagementId, error });
    return { ok: false, reason };
  }
  return { ok: true, value: (data ?? []) as EhrPush[] };
}

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
    default:
      break;
  }
  // These three raise without a code token; matched on the message, which is
  // stable in the migration and not user-facing either way.
  if (/caller is not the seller/i.test(message)) return 'not_seller';
  if (/at most 20 items/i.test(message)) return 'plan_too_many';
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

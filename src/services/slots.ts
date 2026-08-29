// src/services/slots.ts
//
// The open-times board's writes and reads (hearth-network migration 0038b).
//
// THE BOARD READS; THE NETWORK WRITES THE STATES. `held` and `booked` arrive
// from get_my_card_slots and are never set here — a person who asked for a time
// must not have it change under them from this screen. The only writes are POST
// and WITHDRAW (S5 note 4).
//
// NEVER DELETE A TIME. withdraw_card_slot sets a released stamp; held and booked
// times are immutable from this surface and the RPC refuses them outright.
//
// INSTANTS, NEVER NAIVE DATETIMES. post_card_slots takes ISO-8601 instants with
// an explicit offset; the caller converts the clinician's picked wall clock
// through datetime.wallClockToInstant using the STORED practice zone. A naive
// datetime is refused by timestamptz's own parse rather than silently
// reinterpreted, which is the correct failure and not one to work around.
//
// THERE IS NO slot_overlap ERROR (ruling N-13). post_card_slots PRE-CHECKS
// overlap and SKIPS-AND-COUNTS it, as does the unique-index conflict, so an
// overlapping time returns inside {posted, skipped}. The GiST constraint
// card_slots_no_overlap is a RACE BACKSTOP only: it can fire on a concurrent
// insert (SQLSTATE 23P01) and the honest outcome then is the same sentence —
// "already on your board" — not an eighth error state.

import { supabase } from './supabase';

/** The state get_my_card_slots derives per row (0038b:595-599). */
export type SlotState = 'open' | 'held' | 'booked' | 'past';

export type SlotModality = 'video' | 'in_person';

export interface CardSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  modality: SlotModality;
  state: SlotState;
  engagement_id: string | null;
}

/** One time to post. `startsAt`/`endsAt` are ISO instants, offset included. */
export interface SlotDraft {
  starts_at: string;
  ends_at: string;
  modality: SlotModality;
}

/**
 * The failures a board surface can act on. Every one maps to a distinct thing
 * the clinician can do about it — anything that does not is `request_failed`.
 */
export type SlotFailure =
  | 'unauthenticated'
  | 'not_card_owner'
  | 'card_not_practice'
  | 'licence_not_verified'
  | 'slot_in_past'
  | 'slot_lead_time'
  | 'slot_held'
  | 'slot_booked'
  | 'already_on_board' // the 23P01 race — same user-facing truth as a skip
  | 'request_failed';

export type SlotResult<T> = { ok: true; value: T } | { ok: false; reason: SlotFailure };

/** What post_card_slots reports back. */
export interface PostSlotsOutcome {
  posted: number;
  skipped: number;
}

/**
 * Classify a Postgres/PostgREST error.
 *
 * The RPCs carry an explicit `(code: X)` suffix in the message, so matching is
 * on that token rather than on SQLSTATE — several of them raise with P0001,
 * Postgres's default, and matching the code alone would collapse them.
 */
function classify(err: unknown): SlotFailure {
  const message =
    typeof (err as { message?: unknown })?.message === 'string'
      ? String((err as { message: string }).message)
      : '';
  const code =
    typeof (err as { code?: unknown })?.code === 'string'
      ? String((err as { code: string }).code)
      : '';

  // The exclusion constraint, racing a concurrent insert past the pre-check.
  // Folded into "already on your board" by ruling N-13 — the same truth the
  // skip path tells, so the clinician sees one sentence, not two.
  if (code === '23P01') return 'already_on_board';
  if (code === 'PGRST301' || code === '401' || /\bJWT\b/i.test(message)) {
    return 'unauthenticated';
  }

  const codeToken = /\(code:\s*([A-Z_]+)\)/.exec(message)?.[1];
  switch (codeToken) {
    case 'UNAUTHENTICATED':
      return 'unauthenticated';
    case 'NOT_CARD_OWNER':
      return 'not_card_owner';
    case 'CARD_NOT_PRACTICE':
      return 'card_not_practice';
    case 'LICENCE_NOT_VERIFIED':
      return 'licence_not_verified';
    case 'SLOT_IN_PAST':
      return 'slot_in_past';
    case 'SLOT_LEAD_TIME':
      return 'slot_lead_time';
    case 'SLOT_HELD':
      return 'slot_held';
    case 'SLOT_BOOKED':
      return 'slot_booked';
    default:
      return 'request_failed';
  }
}

/** Reads the owner's times for one card. Owner-scoped server-side. */
export async function fetchCardSlots(
  cardId: string,
  from: Date,
  to: Date,
): Promise<SlotResult<CardSlot[]>> {
  const { data, error } = await supabase.rpc('get_my_card_slots', {
    p_card_id: cardId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) {
    const reason = classify(error);
    console.warn('[slots] get_my_card_slots failed:', { reason, cardId, error });
    return { ok: false, reason };
  }
  return { ok: true, value: (data ?? []) as CardSlot[] };
}

/**
 * Posts times. BATCH SEMANTICS: one already-present or overlapping time is
 * skipped and counted, not fatal — the sheet reports "Posted {n}. {m} were
 * already on your board." A time in the past or inside the lead hour RAISES,
 * because that means the app sent something its own UI disabled.
 */
export async function postCardSlots(
  cardId: string,
  slots: SlotDraft[],
): Promise<SlotResult<PostSlotsOutcome>> {
  const { data, error } = await supabase.rpc('post_card_slots', {
    p_card_id: cardId,
    p_slots: slots,
  });
  if (error) {
    const reason = classify(error);
    console.warn('[slots] post_card_slots failed:', { reason, cardId, count: slots.length, error });
    return { ok: false, reason };
  }
  const posted = Number((data as { posted?: unknown })?.posted ?? NaN);
  const skipped = Number((data as { skipped?: unknown })?.skipped ?? NaN);
  if (!Number.isFinite(posted) || !Number.isFinite(skipped)) {
    console.warn('[slots] post_card_slots returned an unexpected value:', data);
    return { ok: false, reason: 'request_failed' };
  }
  console.log('[slots] posted times', { cardId, posted, skipped });
  return { ok: true, value: { posted, skipped } };
}

/**
 * Withdraws one open time. Held and booked times are refused by the RPC —
 * SLOT_HELD / SLOT_BOOKED — which is the guarantee the UI's disabled state only
 * describes. `withdrawn:false` with reason 'already_withdrawn' is a no-op, not
 * a failure: the time was already off the board.
 */
export async function withdrawCardSlot(slotId: string): Promise<SlotResult<boolean>> {
  const { data, error } = await supabase.rpc('withdraw_card_slot', { p_slot_id: slotId });
  if (error) {
    const reason = classify(error);
    console.warn('[slots] withdraw_card_slot failed:', { reason, slotId, error });
    return { ok: false, reason };
  }
  const withdrawn = (data as { withdrawn?: unknown })?.withdrawn === true;
  return { ok: true, value: withdrawn };
}

/**
 * Stores the practice's zone. The app confirms the device zone ONCE (when
 * entities.timezone is null) and every rendered time is placed in the stored
 * value afterwards, never in the device's.
 */
export async function setEntityTimezone(tz: string): Promise<SlotResult<string>> {
  const { data, error } = await supabase.rpc('set_entity_timezone', { p_tz: tz });
  if (error) {
    const reason = classify(error);
    console.warn('[slots] set_entity_timezone failed:', { reason, tz, error });
    return { ok: false, reason };
  }
  return { ok: true, value: typeof data === 'string' ? data : tz };
}

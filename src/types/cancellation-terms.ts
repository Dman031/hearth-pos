/**
 * CancellationTerms — one row of get_engagement_cancellation_terms(uuid, uuid)
 * (hearth-network migration 0057, amended by 0058). N-23 item 1: this function
 * is THE AUTHORITY on the cancellation policy and returns THE ANSWER, not the
 * ingredients. The app renders the answer and holds no policy of its own.
 *
 * Mirrored column-for-column from the LIVE catalog body (public.admin_functiondef,
 * read 2026-09-11), never from the migration's prose:
 *
 *   RETURNS TABLE(engagement_id uuid, is_slot_booking boolean,
 *                 caller_is_seller boolean, window_hours integer,
 *                 scheduled_for timestamp with time zone, inside_window boolean,
 *                 refund_if_cancelled_now text)
 *
 * SECURITY DEFINER and participant-only: it RAISES for a non-participant, for a
 * signed-in caller with no entity row, and for an engagement that does not
 * exist. A raise arrives as an rpc error — never as an empty row to interpret.
 *
 * ADVISORY, BY RULING (N-23 item 5). The boundary can cross between this read
 * and the tap, so the cancel RPC's own return stays authoritative for what
 * actually happened; these values choose the confirm copy only.
 */
export interface CancellationTerms {
  engagement_id: string;
  /** True when a card_slots row is bound — the dispatch to cancel_slot_booking
   *  will fire. A SERVER FACT about which writer runs, not a policy: it decides
   *  whether the row lands in Past immediately (the slot path sets
   *  status='cancelled' unconditionally) or keeps reading Paid until the
   *  by-hand refund lands (cancel_engagement's refund-due arm makes no status
   *  change). BUG-014 established that fork; N-23 only changed where the fact
   *  comes from. */
  is_slot_booking: boolean;
  /** The caller's side of THIS engagement, resolved server-side from the same
   *  actor the cancel will use. The app still derives its own isSeller for
   *  wording; this is the server's own answer to the same question. */
  caller_is_seller: boolean;
  /** The window the policy applies to this engagement, in hours. THE ONLY
   *  SOURCE OF THAT NUMBER IN THIS APP — there is no constant to compare it
   *  against, by design (N-23 item 1). Spoken via formatWindowHours(). */
  window_hours: number;
  scheduled_for: string | null;
  /** Whether a cancellation right now falls inside the window. An undated
   *  engagement reads as inside — there is no instant to measure from. */
  inside_window: boolean;
  /** THE DECISION, and the app's three rendered shapes are exactly its three
   *  values. 'nothing_paid' is NOT 'none': a cancellation that refunds nothing
   *  because nothing was ever paid is a different sentence from one that keeps
   *  the money. */
  refund_if_cancelled_now: 'nothing_paid' | 'full' | 'none';
}

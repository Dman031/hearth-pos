import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import useCards from './useCards';
import { isBridgeStatePracticeBooking } from '../services/practice';
import type { InboundKind, InboundStatus } from '../types/inbound';

// useInboundCount — the Incoming tab's unread badge source (16b item 2, Incoming
// half). A cheap count of the PENDING inbound addressed to me THAT INCOMING
// ACTUALLY SHOWS, kept live on the same realtime signal as useInbound.
// Read-only: RLS (inbound_select_own) scopes the read to my rows. Distinct
// channel name from useInbound so the two subscriptions never collide.
//
// IT WAS A `head: true` COUNT UNTIL N-20-AMENDED-7 item 3; the block below says
// why that shape could not survive the filter, and this line is corrected here
// rather than left describing the old one.
//
// NOTE: only the Incoming badge ships here. The PlexChat unread badge + mark-read
// are deferred — marking a message read needs a NEW mark_thread_read RPC (no
// write path to messages.read_at exists) and a way to re-open an established
// thread (thread-list, item 4). See 16A_16B_SPEC.md "16B BUILD SEQUENCE".
//
// ── N-20-AMENDED-7 item 3, AND WHY THIS IS NO LONGER A HEAD COUNT ───────────
//
// THE BADGE MUST NEVER DISAGREE WITH THE LIST. A count saying 1 over an empty
// Incoming is worse than either number alone: it sends a clinician looking for
// something that is not there, and there is nothing on the screen to correct
// it. So the filter cannot be approximated here — it has to be the SAME
// answer, not a similar one.
//
// A `head: true` count cannot give that answer. The predicate needs the row's
// `kind` and its card's `kind`, and the card is not joinable here at all: the
// card list lives in CardProvider on the client, not in this query.
// So this reads the three columns the predicate needs and counts what survives
// it — the same shared function, over the same `cards` array from the same
// provider, as useInbound and useThreadPendingInbound.
//
// THE COST IS BOUNDED AND SMALL: these are PENDING knocks addressed to one
// entity — an inbox, not a feed — and the select is three columns wide.
//
// THE SELECT STRING AND THE ROW TYPE ARE THE SAME WIDTH, DELIBERATELY. Casting
// three selected columns into the full `Inbound` would be the silent,
// tsc-invisible lie BUGS_AND_SOLUTIONS.md:611 swept five hooks for. PendingRow
// names exactly what is read.

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

/** Exactly the columns COUNT_SELECT reads — never widened by a cast. */
interface PendingRow {
  id: string;
  card_id: string | null;
  kind: InboundKind;
  status: InboundStatus;
}

const COUNT_SELECT = 'id, card_id, kind, status';

export interface UseInboundCount {
  count: number;
  error: Error | null;
}

export default function useInboundCount(): UseInboundCount {
  const { entity } = useEntity();
  const { cards } = useCards();
  const entityId = entity?.id ?? null;
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!entityId) {
        setRows([]);
        return;
      }
      const { data, error: qErr } = await supabase
        .from('inbound')
        .select(COUNT_SELECT)
        .eq('to_entity_id', entityId)
        .eq('status', 'pending');
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'count inbound'));
        return;
      }
      setError(null);
      setRows((data ?? []) as PendingRow[]);
    },
    [entityId],
  );

  useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    const controller = new AbortController();
    void load({ signal: controller.signal });

    const channel: RealtimeChannel = supabase
      .channel(`inbound-count:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound', filter: `to_entity_id=eq.${entityId}` },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'inbound-count realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, load]);

  // The badge's number IS the list's length, derived by the one predicate.
  const count = useMemo(
    () => rows.filter((r) => !isBridgeStatePracticeBooking(r, cards)).length,
    [rows, cards],
  );

  return { count, error };
}

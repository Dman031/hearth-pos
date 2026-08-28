import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { Engagement } from '../types/engagement';

// The ACCEPTED-UNPAID commitments on ONE thread, kept live (Day 22 decision-
// slot ruling 1): the slot shows only what still needs someone — a pending
// knock or an accepted engagement awaiting payment. paid/fulfilled/cancelled
// drop out here (the reload on their status-change event no longer matches);
// the Engagement tab owns finished history. Read-only — every write goes
// through the network's RPCs. RLS (engagements_select_participant, 0017)
// scopes both the query and the stream to the caller's own rows, so the
// thread filter is a narrowing, not a trust boundary.

const ENGAGEMENT_SELECT =
  'id, inbound_id, kind, buyer_entity_id, seller_entity_id, card_id, thread_id, ' +
  'agreed_price_cents, currency, status, scheduled_for, visit_started_at, ' +
  'room_url, room_provider, room_created_at, fulfilled_at, cancelled_at, ' +
  'created_at, updated_at';

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseThreadEngagements {
  engagements: Engagement[];
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useThreadEngagements(threadId: string | null): UseThreadEngagements {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!threadId) {
        setEngagements([]);
        return;
      }
      const { data, error: qErr } = await supabase
        .from('engagements')
        .select(ENGAGEMENT_SELECT)
        .eq('thread_id', threadId)
        // Ruling 1: the slot is "needs a decision/action now" — accepted only.
        .eq('status', 'accepted')
        // Newest first — the most recent commitment is the one the slot leads
        // with. An ARRAY, never a single row: one conversation can carry
        // multiple independently-tracked commitments (Day 21 STEP 0 ruling a).
        .order('created_at', { ascending: false });
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'load thread engagements'));
        return;
      }
      setError(null);
      // Cast through unknown: a concatenated select() column string defeats
      // supabase-js row-type inference (same pattern as CardContext).
      setEngagements((data ?? []) as unknown as Engagement[]);
    },
    [threadId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    if (!threadId) {
      setEngagements([]);
      return;
    }
    const controller = new AbortController();
    void load({ signal: controller.signal });

    const channel: RealtimeChannel = supabase
      .channel(`engagements:thread:${threadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engagements', filter: `thread_id=eq.${threadId}` },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'thread engagements realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [threadId, load]);

  return { engagements, error, refresh };
}

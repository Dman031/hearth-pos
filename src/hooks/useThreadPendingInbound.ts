import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import type { Inbound } from '../types/inbound';

// The PlexChat decision slot's populating source: PENDING knocks on ONE thread
// addressed to the current vendor, kept live (a new knock appears; an
// accept/pass elsewhere drops out). Same posture as useInbound: RLS
// (inbound_select_own) scopes both the query and the stream, so the filters
// are a narrowing, not a trust boundary. Channel topic is thread-scoped —
// NEVER `inbound:{entityId}` — because the Incoming tab's subscription stays
// mounted under the tab navigator and duplicate topics collide.

const INBOUND_SELECT =
  'id, to_entity_id, from_entity_id, card_id, thread_id, kind, message, status, return_address, scheduled_for, quantity, created_at';

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseThreadPendingInbound {
  pending: Inbound[];
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useThreadPendingInbound(threadId: string | null): UseThreadPendingInbound {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [pending, setPending] = useState<Inbound[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!entityId || !threadId) {
        setPending([]);
        return;
      }
      const { data, error: qErr } = await supabase
        .from('inbound')
        .select(INBOUND_SELECT)
        .eq('to_entity_id', entityId)
        .eq('thread_id', threadId)
        .eq('status', 'pending')
        // Oldest first: decisions render in the order they arrived. ARRAYS ARE
        // LOAD-BEARING (Day 21 STEP 0 ruling a): one thread can carry several
        // independent pending items — never collapse to a single newest.
        .order('created_at', { ascending: true });
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'load thread pending inbound'));
        return;
      }
      setError(null);
      setPending((data ?? []) as Inbound[]);
    },
    [entityId, threadId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    if (!entityId || !threadId) {
      setPending([]);
      return;
    }
    const controller = new AbortController();
    void load({ signal: controller.signal });

    const channel: RealtimeChannel = supabase
      .channel(`inbound:thread:${threadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound', filter: `thread_id=eq.${threadId}` },
        () => {
          // Re-read the pending set on any change — small payload, keeps the
          // slot authoritative without per-event diffing.
          void load();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'thread pending inbound realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, threadId, load]);

  return { pending, error, refresh };
}

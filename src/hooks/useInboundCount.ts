import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';

// useInboundCount — the Incoming tab's unread badge source (16b item 2, Incoming
// half). A cheap HEAD count of PENDING inbound addressed to me, kept live on the
// same realtime signal as useInbound. Read-only: RLS (inbound_select_own) scopes
// the count to my rows. Distinct channel name from useInbound so the two
// subscriptions never collide.
//
// NOTE: only the Incoming badge ships here. The PlexChat unread badge + mark-read
// are deferred — marking a message read needs a NEW mark_thread_read RPC (no
// write path to messages.read_at exists) and a way to re-open an established
// thread (thread-list, item 4). See 16A_16B_SPEC.md "16B BUILD SEQUENCE".

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseInboundCount {
  count: number;
  error: Error | null;
}

export default function useInboundCount(): UseInboundCount {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!entityId) {
        setCount(0);
        return;
      }
      // head:true → server returns the count only, no rows transferred.
      const { count: pending, error: qErr } = await supabase
        .from('inbound')
        .select('id', { count: 'exact', head: true })
        .eq('to_entity_id', entityId)
        .eq('status', 'pending');
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'count inbound'));
        return;
      }
      setError(null);
      setCount(pending ?? 0);
    },
    [entityId],
  );

  useEffect(() => {
    if (!entityId) {
      setCount(0);
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

  return { count, error };
}

import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import type { Inbound } from '../types/inbound';

// First Supabase Realtime hook in the app. Loads the PENDING inbound addressed
// to the current vendor and keeps it live: a new knock (INSERT) appears in
// seconds; an accept/pass (UPDATE off 'pending') drops out of the list. RLS
// (inbound_select_own) scopes both the query and the realtime stream to rows
// where to_entity_id = the caller's entity, so the filter is a narrowing, not a
// trust boundary.

const INBOUND_SELECT =
  'id, to_entity_id, from_entity_id, card_id, thread_id, kind, message, status, return_address, created_at';

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseInbound {
  inbound: Inbound[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useInbound(): UseInbound {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [inbound, setInbound] = useState<Inbound[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // `silent` skips the loading flicker for realtime-driven reloads.
  const load = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!entityId) {
        setInbound([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);
      const { data, error: qErr } = await supabase
        .from('inbound')
        .select(INBOUND_SELECT)
        .eq('to_entity_id', entityId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'load inbound'));
        if (!opts?.silent) setIsLoading(false);
        return;
      }
      setError(null);
      setInbound((data ?? []) as Inbound[]);
      if (!opts?.silent) setIsLoading(false);
    },
    [entityId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    if (!entityId) {
      setInbound([]);
      return;
    }
    const controller = new AbortController();
    void load({ signal: controller.signal });

    const channel: RealtimeChannel = supabase
      .channel(`inbound:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound', filter: `to_entity_id=eq.${entityId}` },
        () => {
          // Re-read the pending set on any change — small payload, keeps the
          // list authoritative without per-event diffing.
          void load({ silent: true });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'inbound realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, load]);

  return { inbound, isLoading, error, refresh };
}

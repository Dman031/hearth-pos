import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';

// useEngagementActionCount — the Engagement tab's badge source (Day 21 STOP 5
// ruling 5): commitments needing the vendor's action = status IN
// ('accepted','paid') where the caller is the SELLER — work or money owed to
// them. Cheap HEAD count, mirroring useInboundCount. Realtime reload is an
// unfiltered engagements subscription narrowed by RLS (same reasoning as
// useMyEngagements — postgres_changes cannot express the participant OR, and
// the policy already scopes delivery); distinct channel name so the tab's data
// hook and this badge hook never collide.

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseEngagementActionCount {
  count: number;
  error: Error | null;
}

export default function useEngagementActionCount(): UseEngagementActionCount {
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
      const { count: needing, error: qErr } = await supabase
        .from('engagements')
        .select('id', { count: 'exact', head: true })
        .eq('seller_entity_id', entityId)
        .in('status', ['accepted', 'paid']);
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'count engagements needing action'));
        return;
      }
      setError(null);
      setCount(needing ?? 0);
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
      .channel(`engagements:badge:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engagements' },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'engagement badge realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, load]);

  return { count, error };
}

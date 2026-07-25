import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import type { Engagement } from '../types/engagement';

// The Engagement tab's data source: ALL commitments where the current entity
// is a participant (buyer or seller), kept live. SIBLING of STOP 4's
// useThreadEngagements — deliberately not a generalization of it: that hook is
// built-not-proven and stays untouched, and the shapes genuinely differ
// (thread-eq filter + thread-filtered channel there; participant-OR here).
//
// REALTIME CHOICE: one UNFILTERED subscription narrowed by RLS, not two
// filtered channels. postgres_changes cannot express an OR filter; two
// channels (buyer-eq + seller-eq) would double the connection churn only to
// trigger the same reload. RLS (engagements_select_participant, 0017) already
// scopes WAL delivery to rows the caller can SELECT — exactly the set this
// hook renders — so the server-side filter is redundant with the policy. Same
// trust posture as the rest of the app: filters narrow, RLS is the boundary.

const ENGAGEMENT_SELECT =
  'id, inbound_id, kind, buyer_entity_id, seller_entity_id, card_id, thread_id, ' +
  'agreed_price_cents, currency, status, scheduled_for, fulfilled_at, cancelled_at, ' +
  'created_at, updated_at';

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseMyEngagements {
  engagements: Engagement[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useMyEngagements(): UseMyEngagements {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!entityId) {
        setEngagements([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);
      const { data, error: qErr } = await supabase
        .from('engagements')
        .select(ENGAGEMENT_SELECT)
        .or(`buyer_entity_id.eq.${entityId},seller_entity_id.eq.${entityId}`)
        .order('created_at', { ascending: false });
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'load my engagements'));
        if (!opts?.silent) setIsLoading(false);
        return;
      }
      setError(null);
      // Cast through unknown: a concatenated select() column string defeats
      // supabase-js row-type inference (same pattern as CardContext).
      setEngagements((data ?? []) as unknown as Engagement[]);
      if (!opts?.silent) setIsLoading(false);
    },
    [entityId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    if (!entityId) {
      setEngagements([]);
      return;
    }
    const controller = new AbortController();
    void load({ signal: controller.signal });

    const channel: RealtimeChannel = supabase
      .channel(`engagements:mine:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engagements' },
        () => {
          void load({ silent: true });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'my engagements realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, load]);

  return { engagements, isLoading, error, refresh };
}

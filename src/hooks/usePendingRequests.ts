import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import { fetchPendingRequests, type PendingRequest } from '../services/inquiry';

// usePendingRequests — the honesty chips' read, plus the signal the Incoming
// list was missing.
//
// THE GAP THIS CLOSES. An ask-first message writes a `messages` row and touches
// NO `inbound` row — post_inquiry_message says so in as many words (0040:75:
// "established_at and inbound.status are DELIBERATELY not written here"). Every
// Incoming subscription in this app watches `inbound`. So the clinician's own
// question needs no signal (they sent it), but THE PATIENT'S ANSWER ARRIVES
// SILENTLY: T3 would never appear until something else happened to refetch.
//
// THE FIX, and why this shape:
//   * INSERT-only on `messages`. Sidesteps replica-identity entirely — an
//     INSERT payload carries the new row regardless of REPLICA IDENTITY, and
//     nothing here needs the old one.
//   * UNFILTERED, narrowed by RLS. messages_select_participant (0004:77-79)
//     scopes delivery to threads the caller is in. useUnreadCount.ts:88 already
//     runs an unfiltered messages channel in production, so this is a proven
//     shape rather than a new one.
//   * CLIENT-FILTERED to the threads of the CURRENT pending set, so an ordinary
//     conversation message does not refetch a list it cannot change.
//
// NOT A TIMER. The spec forbids one and is right: a poll is the thing that
// looks fine in a demo and drifts in a day. The plumbing exists; this uses it.

export interface UsePendingRequests {
  /** Keyed by inbound_id — the Incoming list joins on it. */
  byInboundId: Map<string, PendingRequest>;
  isLoading: boolean;
  /** True when the read failed. Chips are omitted rather than guessed. */
  failed: boolean;
  refresh: () => Promise<void>;
}

export default function usePendingRequests(threadIds: string[]): UsePendingRequests {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  // A stable key for the thread set: the effect must re-subscribe when the
  // pending threads change, not on every render that rebuilds the array.
  const threadKey = useMemo(() => [...threadIds].sort().join(','), [threadIds]);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!entityId) {
        setRequests([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);
      const result = await fetchPendingRequests();
      if (opts?.signal?.aborted) return;
      if (!result.ok) {
        // Chips state facts. A failed read means we do not have the facts, so
        // the tile omits them — it never renders an unverified-looking default.
        setFailed(true);
        if (!opts?.silent) setIsLoading(false);
        return;
      }
      setFailed(false);
      setRequests(result.value);
      if (!opts?.silent) setIsLoading(false);
    },
    [entityId],
  );

  useEffect(() => {
    if (!entityId) {
      setRequests([]);
      return;
    }
    const controller = new AbortController();
    void load({ signal: controller.signal });

    const watched = new Set(threadKey.length > 0 ? threadKey.split(',') : []);
    const channel: RealtimeChannel = supabase
      .channel(`inquiry:messages:${entityId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const threadId = (payload.new as { thread_id?: string } | null)?.thread_id;
          if (!threadId || !watched.has(threadId)) return;
          void load({ silent: true });
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, load, threadKey]);

  const refresh = useCallback(async () => {
    await load({ silent: true });
  }, [load]);

  const byInboundId = useMemo(
    () => new Map(requests.map((r) => [r.inbound_id, r])),
    [requests],
  );

  return { byInboundId, isLoading, failed, refresh };
}

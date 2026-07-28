import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import { peerLabel } from './useThreads';
import type { Engagement } from '../types/engagement';

// The Engagement tab's data source: ALL commitments where the current entity
// is a participant (buyer or seller), kept live. SIBLING of STOP 4's
// useThreadEngagements — deliberately not a generalization of it: that hook is
// built-not-proven and stays untouched, and the shapes genuinely differ
// (thread-eq filter + thread-filtered channel there; participant-OR here).
//
// ROW CONTEXT (STOP 5 amendment, 2026-07-27): each row is enriched with
//   - peerName: the counterparty's public label via get_my_thread_peers()
//     (0007 SECURITY DEFINER, public allow-list only — display_name/deus_id/
//     entity_type; never email, phone, user_id). Keyed by thread_id; every
//     engagement's thread is established (the accept that mints one also
//     establishes), so peers resolve unless thread_id was SET NULL.
//   - excerpt: inbound.message via the inbound_id FK embed, collapsed to one
//     line. inbound_select_own (0004) scopes inbound reads to to_entity_id =
//     caller, so the embed resolves on SELLER-side rows and is null on
//     buyer-side rows — omitted, never a placeholder.
//
// REALTIME CHOICE: one UNFILTERED subscription narrowed by RLS, not two
// filtered channels. postgres_changes cannot express an OR filter; two
// channels (buyer-eq + seller-eq) would double the connection churn only to
// trigger the same reload. RLS (engagements_select_participant, 0017) already
// scopes WAL delivery to rows the caller can SELECT — exactly the set this
// hook renders — so the server-side filter is redundant with the policy. Same
// trust posture as the rest of the app: filters narrow, RLS is the boundary.
// CAVEAT (BUG-009): engagements is not in the realtime publication yet, so
// this channel is dormant until the network-side one-liner lands; the screen
// refreshes explicitly after its own writes.

const ENGAGEMENT_SELECT =
  'id, inbound_id, kind, buyer_entity_id, seller_entity_id, card_id, thread_id, ' +
  'agreed_price_cents, currency, status, scheduled_for, fulfilled_at, cancelled_at, ' +
  'created_at, updated_at, inbound:inbound_id ( message )';

/** An engagement row + the app-side display context joined at load time.
 *  Wrapper type on purpose: types/engagement.ts mirrors the network-owned
 *  table contract and must not gain app-only fields. */
export type MyEngagement = Engagement & {
  peerName: string | null;
  excerpt: string | null;
};

/** Raw select shape: the table row plus the embedded inbound (null when the
 *  FK is SET NULL or RLS hides the row from a buyer-side caller). */
type EngagementRowRaw = Engagement & { inbound: { message: string | null } | null };

interface PeerRow {
  thread_id: string;
  peer_entity_id: string;
  display_name: string | null;
  deus_id: string | null;
  entity_type: string | null;
}

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseMyEngagements {
  engagements: MyEngagement[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useMyEngagements(): UseMyEngagements {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [engagements, setEngagements] = useState<MyEngagement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!entityId) {
        setEngagements([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);
      const [rowsRes, peersRes] = await Promise.all([
        supabase
          .from('engagements')
          .select(ENGAGEMENT_SELECT)
          .or(`buyer_entity_id.eq.${entityId},seller_entity_id.eq.${entityId}`)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_thread_peers'),
      ]);
      if (opts?.signal?.aborted) return;
      if (rowsRes.error) {
        setError(toError(rowsRes.error, 'load my engagements'));
        if (!opts?.silent) setIsLoading(false);
        return;
      }
      // Peer resolution failing is non-fatal: rows render with the kind-noun
      // fallback header (same posture as useThreadPeer).
      if (peersRes.error) {
        console.warn('[useMyEngagements] get_my_thread_peers failed', {
          error: peersRes.error.message,
        });
      }
      const peerByThread = new Map(
        (((peersRes.data ?? []) as PeerRow[])).map((p) => [p.thread_id, p]),
      );
      // Cast through unknown: a concatenated select() column string defeats
      // supabase-js row-type inference (same pattern as CardContext).
      const next = ((rowsRes.data ?? []) as unknown as EngagementRowRaw[]).map(
        ({ inbound, ...engagement }): MyEngagement => {
          const peer = engagement.thread_id ? peerByThread.get(engagement.thread_id) : undefined;
          const oneLine = inbound?.message?.replace(/\s+/g, ' ').trim() ?? '';
          return {
            ...engagement,
            peerName: peer ? peerLabel(peer) : null,
            excerpt: oneLine.length > 0 ? oneLine : null,
          };
        },
      );
      setError(null);
      setEngagements(next);
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

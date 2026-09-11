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
// LIVE since hearth-network 0041 (applied 2026-08-26; publication membership
// confirmed directly against pg_publication_tables). This channel was dormant
// from 2026-07-27 to then — BUG-009, now CLOSED — because engagements was
// never in the supabase_realtime publication. The screen's explicit refresh
// after its own writes stays: it is idempotent redundancy, not a workaround
// to remove (PLEXMED S7 spec, app-side gap 2).

// `card:card_id ( kind )` is N-20's cancellation split reaching the app: the
// network refunds a practice slot on a 24-hour boundary and everything else on
// 14 days, and the confirm copy has to name the right one BEFORE the call.
// Embedded the same way `inbound` already is.
//
// ██ IT COMES BACK NULL FOR THE BUYER. MEASURED, NOT INFERRED. ███████████████
//
// `scripts/probe-cards-rls.mjs`, run 2026-09-11 against the live dev database
// with a REAL signed-in session on the app's own anon key:
//
//     buyer  · direct card read (see_perm 'anyone')   : NO ROW
//     buyer  · direct card read (see_perm 'verified') : NO ROW
//     buyer  · ENGAGEMENT_SELECT embed -> card.kind   : null
//     seller · direct card read                       : ROW RETURNED
//     seller · ENGAGEMENT_SELECT embed -> card.kind   : "practice"
//
// No error on any read — RLS filters silently, which is why nothing about this
// was visible from the app. `public.cards` has RLS enabled (0000:141) and no
// select policy in any migration in either repo, so the policy that lets a
// SELLER read was applied by hand and is owner-scoped.
//
// SO THIS EMBED IS SELLER-ONLY IN PRACTICE. On a practice booking the buyer is
// the PATIENT, which means cardKind is null for every patient-initiated
// cancellation from this app and the confirm's "unknown" arm is THE LIVE PATH
// for them — it names no window and points at the unconditional seller-cancel
// alternative. That is correct behaviour over a real gap, not a fallback nobody
// reaches: closing it needs a narrow network-side read (a card_kind column on an
// existing RPC, or a SECURITY DEFINER helper), NEVER a widened RLS policy on
// `cards`. Flagged, not fixed here.
//
// The caller must therefore treat null as UNKNOWN and never as "not practice" —
// which is also true of the other way it goes null, a deleted card (FK SET NULL).
const ENGAGEMENT_SELECT =
  'id, inbound_id, kind, buyer_entity_id, seller_entity_id, card_id, thread_id, ' +
  'agreed_price_cents, currency, status, scheduled_for, visit_started_at, ' +
  'room_url, room_provider, room_created_at, fulfilled_at, cancelled_at, ' +
  'created_at, updated_at, inbound:inbound_id ( message ), card:card_id ( kind )';

/** An engagement row + the app-side display context joined at load time.
 *  Wrapper type on purpose: types/engagement.ts mirrors the network-owned
 *  table contract and must not gain app-only fields. */
export type MyEngagement = Engagement & {
  peerName: string | null;
  excerpt: string | null;
  /** LEDGER truth via get_my_engagement_settlement (0023): true = a succeeded
   *  charge stands; false = none; null = UNKNOWN (helper call failed, or the
   *  id was absent from its result). Null is never coerced to false — the
   *  cancel confirm refuses to guess on null instead of promising a free
   *  cancel on a paid row. Same predicate as cancel_engagement (0022), so the
   *  confirm and the RPC cannot disagree on paid-ness. */
  settled: boolean | null;
  /** The card's kind, for the cancellation split (N-20). NULL MEANS UNKNOWN —
   *  a deleted card or a row RLS did not return — never "not a practice card".
   *  The confirm copy names no refund window on null rather than guessing one;
   *  the outcome itself always comes from the RPC's return (ruling 5). */
  cardKind: string | null;
};

/** Raw select shape: the table row plus the embedded inbound (null when the
 *  FK is SET NULL or RLS hides the row from a buyer-side caller). */
type EngagementRowRaw = Engagement & {
  inbound: { message: string | null } | null;
  card: { kind: string | null } | null;
};

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
      const rows = (rowsRes.data ?? []) as unknown as EngagementRowRaw[];

      // LEDGER truth (Day 22 item 5): ONE batched call to the 0023 helper with
      // exactly the ids just loaded — never per-row. On failure, settled stays
      // null on every row (unknown), never false: transactions is sealed to
      // the client, so a failed/empty read is NOT evidence of "unpaid".
      let settledById: Map<string, boolean> | null = null;
      if (rows.length === 0) {
        settledById = new Map();
      } else {
        const settleRes = await supabase.rpc('get_my_engagement_settlement', {
          p_engagement_ids: rows.map((r) => r.id),
        });
        if (opts?.signal?.aborted) return;
        if (settleRes.error) {
          console.warn('[useMyEngagements] get_my_engagement_settlement failed', {
            error: settleRes.error.message,
          });
        } else {
          settledById = new Map(
            ((settleRes.data ?? []) as { engagement_id: string; settled: boolean }[]).map(
              (r) => [r.engagement_id, r.settled],
            ),
          );
        }
      }

      const next = rows.map(
        ({ inbound, card, ...engagement }): MyEngagement => {
          const peer = engagement.thread_id ? peerByThread.get(engagement.thread_id) : undefined;
          const oneLine = inbound?.message?.replace(/\s+/g, ' ').trim() ?? '';
          return {
            ...engagement,
            peerName: peer ? peerLabel(peer) : null,
            excerpt: oneLine.length > 0 ? oneLine : null,
            // Absent from the helper's result = not-yours-or-nonexistent, NOT
            // unsettled — those ids stay null (unknown), same as a failed call.
            settled: settledById ? (settledById.get(engagement.id) ?? null) : null,
            // `?? null` collapses a missing embed and a null kind to one value,
            // and they mean the same thing HERE: we do not know which refund
            // rule applies. Never coerced to a string — see the type's note.
            cardKind: card?.kind ?? null,
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

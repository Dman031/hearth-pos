import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';

// useUnreadCount — the PlexChat tab's unread badge source (16b item 2b, PlexChat
// half). A cheap HEAD count of my UNREAD, RECEIVED messages across ALL threads,
// kept live on a realtime signal. Mirrors useInboundCount, with two deliberate
// differences dictated by the messages schema:
//
//   1. Predicate: read_at IS NULL AND from_entity_id <> me. Own sends land with
//      read_at NULL too (post_message never stamps it), so they MUST be excluded
//      or they'd inflate my own badge. This matches mark_thread_read (0008), which
//      only stamps received messages — count and write agree on "received only".
//
//   2. Realtime scope: messages has NO per-user column to filter on (only
//      thread_id / from_entity_id), so — unlike useInboundCount's
//      to_entity_id filter — this subscribes with NO filter and relies on realtime
//      RLS (messages_select_participant → is_thread_participant) to deliver only
//      my-thread events. The read_at UPDATE that clears a badge is authorized by
//      that RLS check, which needs thread_id in the changed row: hence messages
//      replica identity FULL (0008). Without FULL the decrement event is dropped.
//
// Read-only for the caller; RLS scopes the count to my threads. Distinct channel
// name (messages-unread:${entityId}) so it never collides with useThreadMessages'
// messages:${threadId} subscription.

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseUnreadCount {
  count: number;
  error: Error | null;
}

export default function useUnreadCount(): UseUnreadCount {
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
      // head:true → server returns the count only, no rows transferred. RLS scopes
      // to my threads; the partial index messages_thread_unread_idx backs read_at
      // IS NULL. Exclude own sends so the badge counts only messages I received.
      const { count: unread, error: qErr } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('from_entity_id', entityId);
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'count unread messages'));
        return;
      }
      setError(null);
      setCount(unread ?? 0);
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

    // No filter: messages has no per-user column. Realtime RLS delivers only
    // my-thread rows; INSERT increments, the read_at UPDATE decrements (needs
    // replica identity FULL, set in 0008). Any delivered change → recount.
    const channel: RealtimeChannel = supabase
      .channel(`messages-unread:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'messages-unread realtime'));
        }
      });

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [entityId, load]);

  return { count, error };
}

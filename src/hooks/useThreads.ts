import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';

// useThreads — the PlexChat conversation list (16b item 4). Established threads I
// participate in, newest-active first, each labelled with the OTHER participant's
// public name. Read-only:
//   - threads metadata via the threads_select_participant RLS policy (0006)
//   - peer public fields via get_my_thread_peers() SECURITY DEFINER fn (0007),
//     which returns ONLY display_name/deus_id/entity_type (no PII).
//   - per-thread unread count (16b item 2b): messages with read_at IS NULL that I
//     RECEIVED (from_entity_id <> me), backing the ConversationList row dot. Own
//     sends are excluded (they land read_at NULL too) — matches mark_thread_read.
//     RLS (messages_select_participant) scopes it to my threads.
// Fetch-on-FOCUS (not realtime): threads is not in the realtime publication, so
// the list refreshes when the PlexChat tab regains focus. The open conversation
// itself stays live (useThreadMessages). Names are intentionally NOT timestamped
// — src/datetime.ts (the mandated formatter) does not exist yet; rows order by
// last_message_at but render no date.

interface ThreadRow {
  id: string;
  last_message_at: string;
  state: string;
}

interface PeerRow {
  thread_id: string;
  peer_entity_id: string;
  display_name: string | null;
  deus_id: string | null;
  entity_type: string | null;
}

export interface Conversation {
  threadId: string;
  peerName: string;
  peerEntityId: string | null;
  unreadCount: number;
}

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

/** A peer's display label: real name, else its public deus id, else a fallback. */
export function peerLabel(p: Pick<PeerRow, 'display_name' | 'deus_id'> | undefined): string {
  if (p?.display_name && p.display_name.trim().length > 0) return p.display_name;
  if (p?.deus_id && p.deus_id.trim().length > 0) return `#${p.deus_id}`;
  return 'Conversation';
}

export interface UseThreads {
  conversations: Conversation[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useThreads(): UseThreads {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!entityId) {
        setConversations([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);

      // Established threads I'm in, newest-active first (RLS scopes to me).
      const { data: threadData, error: tErr } = await supabase
        .from('threads')
        .select('id, last_message_at, state')
        .not('established_at', 'is', null)
        .order('last_message_at', { ascending: false });
      if (tErr) {
        setError(toError(tErr, 'load threads'));
        if (!opts?.silent) setIsLoading(false);
        return;
      }

      // Peer public fields per established thread (definer fn; PII-safe).
      const { data: peerData, error: pErr } = await supabase.rpc('get_my_thread_peers');
      if (pErr) {
        setError(toError(pErr, 'load thread peers'));
        if (!opts?.silent) setIsLoading(false);
        return;
      }

      const peers = (peerData ?? []) as PeerRow[];
      const peerByThread = new Map(peers.map((p) => [p.thread_id, p]));

      // Unread I received, per thread: read_at IS NULL AND from_entity_id <> me.
      // One row per unread message (thread_id only); tallied client-side. Cheap —
      // partial-indexed (messages_thread_unread_idx) and RLS-scoped to my threads.
      const { data: unreadData, error: uErr } = await supabase
        .from('messages')
        .select('thread_id')
        .is('read_at', null)
        .neq('from_entity_id', entityId);
      if (uErr) {
        setError(toError(uErr, 'load unread counts'));
        if (!opts?.silent) setIsLoading(false);
        return;
      }

      const unreadByThread = new Map<string, number>();
      for (const m of (unreadData ?? []) as { thread_id: string }[]) {
        unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
      }

      const next: Conversation[] = ((threadData ?? []) as ThreadRow[]).map((t) => {
        const peer = peerByThread.get(t.id);
        return {
          threadId: t.id,
          peerName: peerLabel(peer),
          peerEntityId: peer?.peer_entity_id ?? null,
          unreadCount: unreadByThread.get(t.id) ?? 0,
        };
      });

      setError(null);
      setConversations(next);
      if (!opts?.silent) setIsLoading(false);
    },
    [entityId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // Refetch each time the list regains focus (cheap; keeps recency current
  // without a threads realtime subscription).
  useFocusEffect(
    useCallback(() => {
      void load({ silent: conversations.length > 0 });
      // no teardown — a Supabase query is one-shot, nothing to unsubscribe.
    }, [load, conversations.length]),
  );

  return { conversations, isLoading, error, refresh };
}
